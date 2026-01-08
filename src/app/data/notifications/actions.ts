"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NotificationType } from "@/generated/prisma";

async function getSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}

/**
 * Send a notification (Broadcast, Ticket, etc.)
 */
  /* ... existing imports */

export async function sendNotificationAction(data: {
  title: string;
  content: string;
  type: NotificationType;
  courseId?: string;
  recipientId?: string;
  imageUrl?: string;
  threadId?: string;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // NEW: Generate threadId if not present for tickets
  // For Support Tickets, we use a deterministic ID based on the user ID
  // to group all their tickets into a single conversation.
  let threadId = data.threadId;
  if (!threadId && data.type === "SUPPORT_TICKET") {
    threadId = `support_${session.user.id}`;
  }
  
  // For other types, generate a random one if missing
  threadId = threadId || crypto.randomUUID();

  // Check if threadId is actually a Chat Group
  let chatGroupId: string | undefined;
  let finalType = data.type;

  if (data.threadId) {
    const group = await prisma.chatGroup.findUnique({
        where: { id: data.threadId },
        select: { id: true, courseId: true, name: true }
    });
    if (group) {
        chatGroupId = group.id;
        finalType = "GROUP_CHAT";
        
        // Restriction: Only Admins can post to Broadcast group
        if (group.name === "Broadcast" && group.courseId === null && session.user.role !== "admin") {
            throw new Error("Only admins can post to the Broadcast channel");
        }
    }
  }

  // Enforcement: 3-ticket limit for users
  if (data.type === "SUPPORT_TICKET") {
    if (session.user.isSupportBanned) {
        throw new Error("You are banned from creating support tickets.");
    }
    
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    
    // Check how many messages (tickets) the user has sent today
    const dailyTickets = await prisma.notification.count({
      where: {
        senderId: session.user.id,
        type: "SUPPORT_TICKET",
        createdAt: { gte: startOfDay }
      }
    });

    if (dailyTickets >= 3) {
      throw new Error("TICKET_LIMIT_REACHED");
    }

    // Ensure the thread is visible for both parties
    await unhideThreadForAll(threadId);
  }

  const notification = await prisma.notification.create({
    data: {
      title: data.title,
      content: data.content,
      type: finalType,
      senderId: session.user.id,
      courseId: data.courseId,
      recipientId: data.recipientId,
      imageUrl: data.imageUrl,
      threadId: threadId,
      chatGroupId: chatGroupId
    },
  });

  // If it's a specific recipient, create an initial state for them
  if (data.recipientId) {
    await prisma.userNotificationState.create({
      data: {
        userId: data.recipientId,
        notificationId: notification.id,
        read: false,
      },
    });
  }

  // Unhide for everyone (if it was hidden)
  await unhideThreadForAll(threadId);

  revalidatePath("/");
  return { success: true, notification };
}

// ... getMyNotificationsAction ... (omitted for brevity, assume unchanged or updated separately if needed)

export async function replyToTicketAction(data: {
  threadId: string;
  recipientId: string;
  content: string;
}) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") throw new Error("Unauthorized");

  await prisma.notification.create({
    data: {
      title: `RE: Support Ticket`,
      content: data.content,
      type: "ADMIN_REPLY",
      senderId: session.user.id,
      recipientId: data.recipientId,
      threadId: data.threadId,
    },
  });

  // Unhide for everyone (if it was hidden)
  await unhideThreadForAll(data.threadId);

  // Mark all messages in thread as read for admin? Or just specific ones?
  // For now, let's leave read status logic to the view.

  revalidatePath("/");
  return { success: true };
}

// NEW ACTIONS

export async function getThreadsAction() {
  const session = await getSession();
  if (!session) return [];
  const isAdmin = session.user.role === "admin";

  // Ensure default "Support" group and "Broadcast" group exist
  const defaultGroups = ["Support", "Broadcast"];
  
  // Note: We used to loop and create, but it caused duplicates if executed in parallel or multiple times.
  // Instead, just ensure we fetch one valid one.
  
  // SELF-HEAL: Ensure all Published courses have a Broadcast Group
  if (isAdmin) {
      const missingGroups = await prisma.course.findMany({
          where: {
              status: "Published",
              chatGroups: { none: {} }
          }
      });
      // ... creation logic ...
  }
  // Remove the explicit creation loop here to prevent race conditions on every fetch.
  // Instead, rely on a seed script or just one-time admin check.
  // OR fix the filtering below to only pick unique IDs.


  // SELF-HEAL: Ensure all Published courses have a Broadcast Group
  if (isAdmin) {
      const missingGroups = await prisma.course.findMany({
          where: {
              status: "Published",
              chatGroups: { none: {} }
          }
      });

      if (missingGroups.length > 0) {
          await Promise.all(missingGroups.map(c => 
              prisma.chatGroup.create({
                  data: {
                      name: `${c.title} Group`,
                      courseId: c.id,
                      imageUrl: c.fileKey
                  }
              })
          ));
      }
  }

  // Strategy: Group by threadId to find unique conversations
  // For users: conversations where they are sender OR recipient
  // For admins: ALL conversations (where type is Ticket or Reply)
  
  // 1. Find relevant notification IDs (latest per thread)
  const whereClause = isAdmin 
    ? { OR: [{ type: "SUPPORT_TICKET" }, { type: "ADMIN_REPLY" }, { type: "GROUP_CHAT" as any }] }
    : { 
        OR: [
           { senderId: session.user.id }, 
           { recipientId: session.user.id }
        ]
      };

  // Using groupBy to get latest message date per thread
  const threads = await prisma.notification.groupBy({
    by: ['threadId'],
    where: {
      ...whereClause as any, // TS gymnastics for dynamic where
      threadId: { not: null }
    },
    _max: { createdAt: true },
    orderBy: {
      _max: { createdAt: 'desc' }
    }
  });

  // 2. Fetch details for these notifications to build the thread summary
  // We need the latest message content, sender info, and resolve status
  const threadDetails = await Promise.all(threads.map(async (t) => {
    if (!t.threadId) return null;
    
    // Get the latest message for this thread
    const latestMsg = await prisma.notification.findFirst({
      where: { 
        threadId: t.threadId,
        createdAt: t._max.createdAt! 
      },
      include: {
        sender: { select: { id: true, name: true, image: true, email: true } },
        recipient: { select: { id: true, name: true, image: true, email: true } },
        chatGroup: true
      }
    });

    if (!latestMsg) return null;

    // Calculate unread count for this thread for the current user
    const unreadCount = await prisma.notification.count({
      where: {
        threadId: t.threadId,
        userStates: {
          some: {
            userId: session.user.id,
            read: false
          }
        },
        // Don't count own messages as unread (though userStates logic should handle this)
        senderId: { not: session.user.id }
      }
    });
    
    // Determine Display Info
    let display = {
      name: "Support Team",
      image: "", // Use default support icon
      email: "support@platform.com"
    };

    if (latestMsg.chatGroupId && latestMsg.chatGroup) {
        // It is a group chat
        display = {
            name: latestMsg.chatGroup.name,
            image: latestMsg.chatGroup.imageUrl || "",
            email: "Group"
        };
    } else if (isAdmin) {
      // For Admins, identifying the student:
      // 1. If sender is NOT admin, then sender is the student.
      // 2. If sender IS admin (e.g. I replied), then recipient is the student.
      // 3. Fallback: Search for a message in this thread sent by a non-admin.
      
      let targetUser = null;
      
      if (latestMsg.senderId !== session.user.id) {
          targetUser = latestMsg.sender;
      } else if (latestMsg.recipient) {
          targetUser = latestMsg.recipient;
      }

      if (!targetUser) {
          // Fallback search
          // HANDLE NULL ROLES CORRECTLY
          const studentMsg = await prisma.notification.findFirst({
            where: { 
                threadId: t.threadId, 
                sender: { 
                    OR: [
                        { role: null },
                        { role: { not: "admin" } }
                    ]
                }
            },
            include: { sender: true }
          });
          targetUser = studentMsg?.sender;
      }

      if (targetUser) {
        display = {
           name: targetUser.name || targetUser.email || "Student",
           image: targetUser.image || "",
           email: targetUser.email
        };
      } else {
         // If we really can't find the user, show "Unknown Ticket" rather than "Support Team"
         // to avoid confusion that it's the team itself.
         display = {
            name: "Ticket User", // Generic fallback
            image: "",
            email: ""
         };
      }
    } else {
        // User side
        // Keep "Support Team"
    }

    return {
      threadId: t.threadId,
      lastMessage: latestMsg.content,
      updatedAt: latestMsg.createdAt,
      unreadCount,
      resolved: latestMsg.resolved, 
      isGroup: !!latestMsg.chatGroupId,
      type: latestMsg.chatGroupId ? "Group" : "Ticket",
      display
    };
  }));



  // Filter out nulls AND Groups (because Groups are handled separately below to ensure they show up even if empty)
  const validThreads = threadDetails.filter(t => t !== null && !t.isGroup) as any[];

    // 3. Fetch Chat Groups
  // Admin sees all groups
  // Users see groups for their enrolled courses
  // EXCLUDE "Support" ChatGroup as it is confusing (we use Tickets for support)
  let groupWhere: any = {
      name: { not: "Support" }
  };

  if (!isAdmin) {
    const userEnrollments = await prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "Granted" },
      select: { courseId: true }
    });
    const courseIds = userEnrollments.map(e => e.courseId);
    groupWhere = {
        AND: [
            { name: { not: "Support" } },
            {
                OR: [
                    { courseId: { in: courseIds } },
                    { courseId: null } // General groups
                ]
            }
        ]
    };
  }

  const groups = await prisma.chatGroup.findMany({
    where: groupWhere,
    include: {
        messages: {
            take: 1,
            orderBy: { createdAt: 'desc' }
        }
    }
  });
  
  // Deduplicate groups: 
  // 1. By ID (standard)
  // 2. By Name for global groups (Support, Broadcast) because we might have accidentally created duplicates in DB
  const uniqueGroupsMap = new Map<string, typeof groups[0]>();
  
  groups.forEach(g => {
      // If it's a global group (no courseId), use name as key to enforce one per type
      // Otherwise use unique ID
      const key = g.courseId ? g.id : `GLOBAL_NAME_${g.name}`;
      
      if (!uniqueGroupsMap.has(key)) {
          uniqueGroupsMap.set(key, g);
      }
      // If we already have it, we could potentially check which one has more messages, 
      // but for now keeping the first one is stable.
  });

  const uniqueGroups = Array.from(uniqueGroupsMap.values());

  // Map groups to thread structure
  const groupThreads = await Promise.all(uniqueGroups.map(async (g) => {
     // Check unread count
     const unreadCount = await prisma.notification.count({
        where: {
            chatGroupId: g.id,
            userStates: {
                some: {
                    userId: session.user.id,
                    read: false
                }
            },
            senderId: { not: session.user.id }
        }
     });

     const lastMsg = g.messages[0];
     
     return {
        threadId: g.id, // Use Group ID as thread ID
        lastMessage: lastMsg?.content || "No messages yet",
        updatedAt: lastMsg?.createdAt || g.createdAt,
        unreadCount,
        resolved: true, // Groups don't have resolved state really
        isGroup: true,
        type: "Group", // Tag
        display: {
            name: g.name,
            image: g.imageUrl || "", // TODO: Default Group Icon
            email: ""
        }
     };
  }));

  // 4. Fetch User states for these threads (archived, hidden)
  const userStates = await prisma.userThreadState.findMany({
      where: { userId: session.user.id }
  });
  
  const stateMap = new Map(userStates.map(s => [s.threadId, s]));

  // Combine and Sort
  const allThreads = [...validThreads, ...groupThreads].map(t => {
      const state = stateMap.get(t.threadId);
      return {
          ...t,
          archived: state?.archived ?? false,
          hidden: state?.hidden ?? false,
          muted: state?.muted ?? false
      };
  }).sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // Filter out hidden threads
  return allThreads.filter(t => !t.hidden);
}

export async function getThreadMessagesAction(threadId: string, before?: string) {
  const session = await getSession();
  if (!session) return { messages: [], state: null, nextCursor: null };

  const referenceDate = before ? new Date(before) : new Date();
  const fiveDaysAgo = new Date(referenceDate);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const messages = await prisma.notification.findMany({
    where: { 
        threadId,
        createdAt: {
            lt: referenceDate,
            gte: fiveDaysAgo
        }
    },
    include: {
      sender: { select: { id: true, name: true, image: true, role: true, isSupportBanned: true, lastSeen: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  const state = await prisma.userThreadState.findUnique({
    where: {
      userId_threadId: {
        userId: session.user.id,
        threadId
      }
    }
  });
  
  if (!before) {
    await prisma.userNotificationState.updateMany({
      where: {
          userId: session.user.id,
          read: false,
          notification: { threadId }
      },
      data: { read: true }
    });
    revalidatePath("/");
  }

  const oldestEver = await prisma.notification.findFirst({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
  });

  const nextCursor = (oldestEver && oldestEver.createdAt < fiveDaysAgo) ? fiveDaysAgo.toISOString() : null;

  return {
    messages: [...messages].reverse(),
    state: {
      isMuted: state?.muted ?? false,
      isArchived: state?.archived ?? false,
      isHidden: state?.hidden ?? false
    },
    nextCursor
  };
}

// ... existing helper functions ...

export async function createChatGroupAction(name: string, courseId: string) {
    const session = await getSession();
    if (!session || session.user.role !== "admin") throw new Error("Unauthorized");

    const group = await prisma.chatGroup.create({
        data: {
            name,
            courseId: courseId === "all" ? null : courseId
        }
    });

    revalidatePath("/");
    return group;
}

export async function getPublishedCoursesAction() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") return [];

  return await prisma.course.findMany({
    where: { status: "Published" },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * Fetch notifications for the current user
 * This includes direct messages and relevant broadcasts
 */
export async function getMyNotificationsAction(filters?: { 
  unreadOnly?: boolean; 
  type?: NotificationType;
  take?: number;
  mode?: 'inbox' | 'sent';
}) {
  const session = await getSession();
  if (!session) return [];

  const userEnrollments = await prisma.enrollment.findMany({
    where: { userId: session.user.id, status: "Granted" },
    select: { courseId: true }
  });
  const courseIds = userEnrollments.map(e => e.courseId);
  const isAdmin = session.user.role === "admin";

  const isSentMode = filters?.mode === 'sent';

  const notifications = await prisma.notification.findMany({
    where: {
      AND: [
        isSentMode ? { senderId: session.user.id } : {
          OR: [
            { recipientId: session.user.id }, // Direct
            { type: "BROADCAST" },           // All
            { 
              type: "COURSE_MODAL",        // Specific Course
              courseId: { in: courseIds } 
            },
            ...(isAdmin ? [{ type: "SUPPORT_TICKET" as const }] : []) // Admins see all tickets
          ]
        },
        filters?.type ? { type: filters.type } : {},
        filters?.unreadOnly && !isSentMode ? {
          userStates: {
            none: {
              userId: session.user.id,
              read: true
            }
          }
        } : {}
      ]
    },
    include: {
      userStates: {
        where: { userId: session.user.id }
      },
      sender: {
        select: { name: true, image: true, email: true }
      },
      course: {
        select: { title: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: filters?.take ?? 50
  });

  return notifications.map(n => ({
    ...n,
    isRead: n.userStates.length > 0 ? n.userStates[0].read : false
  }));
}

/**
 * Mark a notification as read
 */
export async function markAsReadAction(notificationId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await prisma.userNotificationState.upsert({
    where: {
      userId_notificationId: {
        userId: session.user.id,
        notificationId: notificationId
      }
    },
    update: { read: true },
    create: {
      userId: session.user.id,
      notificationId: notificationId,
      read: true
    }
  });

  revalidatePath("/");
  return { success: true };
}

/**
 * Mark all notifications as read
 */
export async function markAllAsReadAction() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // This is a bit more complex for broadcasts as we need to create states for all
  // For now, let's just mark existing states as read.
  // In a real app, you'd find all relevant notification IDs and upsert states.
  
  const notifications = await getMyNotificationsAction();
  const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);

  for (const id of unreadIds) {
    await prisma.userNotificationState.upsert({
      where: { userId_notificationId: { userId: session.user.id, notificationId: id } },
      update: { read: true },
      create: { userId: session.user.id, notificationId: id, read: true }
    });
  }

  revalidatePath("/");
  return { success: true };
}

/**
 * Mark all notifications in a thread as read
 */
export async function markThreadAsReadAction(threadId: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  // Find all unread notifications in this thread that are NOT sent by me
  // Actually, we just need to ensure a UserNotificationState exists and is read=true for all relevant notifications
  
  // 1. Get all notification IDs in this thread
  const notifications = await prisma.notification.findMany({
      where: { threadId },
      select: { id: true }
  });

  // 2. Upsert read state for all of them
  // Prisma doesn't support bulk upsert easily, but we can do updateMany for existing states
  // and createMany for missing ones?
  // Simpler approach for now: Loop (inefficient but safe) or just updateMany if we assume states exist (which strictly they might not).
  // Ideally, when a notification is created, we create state for recipient.
  // But for Groups, we don't pre-create states for everyone.
  
  // OPTIMIZED APPROACH:
  // 1. Update existing states to read=true
  await prisma.userNotificationState.updateMany({
      where: {
          userId: session.user.id,
          notificationId: { in: notifications.map(n => n.id) },
          read: false
      },
      data: { read: true }
  });

  // 2. For those that don't have state yet (e.g. Group messages you haven't seen), create them as read.
  // This is tricker to do in bulk without raw SQL or known missing list.
  // For now, the existing "Unread Count" logic relies on `userStates: { some: { read: false } }`.
  // If no state exists, it technically counts as... wait.
  // Prisma unread count logic: `userStates: { some: { userId: me, read: false } }`.
  // So if NO state exists, it is NOT counted as unread?
  // Let's check `getThreadsAction`: 
  // `userStates: { some: { userId: session.user.id, read: false } }`.
  // Yes, so if state is missing, it is NOT unread. Thus, we only need to update EXISTING false states.
  
  revalidatePath("/");
  return { success: true };
}

/**
 * Delete a notification
 */
export async function deleteNotificationAction(id: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const isAdmin = session.user.role === "admin";
  
  await prisma.notification.delete({
    where: isAdmin ? { id } : { id, recipientId: session.user.id }
  });

  revalidatePath("/");
  return { success: true };
}

export async function deleteMessageAction(id: string) {
   return deleteNotificationAction(id);
}

export async function editMessageAction(id: string, newContent: string, imageUrl?: string | null) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const message = await prisma.notification.findUnique({ where: { id } });
  if (!message) throw new Error("Message not found");

  if (message.senderId !== session.user.id) throw new Error("Unauthorized");

  await prisma.notification.update({
    where: { id },
    data: { 
        content: newContent,
        imageUrl: imageUrl // undefined means no change, null means remove? No, prisma ignores undefined. 
        // We need specific logic if we want to remove it.
        // Let's assume passed value is the NEW value (string or null).
        // If undefined, we might not want to touch it, but typical "edit" form sends all state.
        // Let's pass "undefined" if no change intended? 
        // actually simplicity: just pass what we have.
    }
  });

  revalidatePath("/");
  return { success: true };
}



/**
 * Resolve a ticket
 */
export async function resolveTicketAction(id: string, status: "Resolved" | "Denied" = "Resolved") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await prisma.notification.update({
    where: { id },
    data: { 
        resolved: true,
        feedback: status
    }
  });

  revalidatePath("/");
  return { success: true };
}

/**
 * Submit feedback for a reply
 */
export async function submitFeedbackAction(data: {
  notificationId: string;
  feedback: string;
}) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await prisma.notification.update({
    where: { id: data.notificationId },
    data: { 
      feedback: data.feedback,
      resolved: true // Feedback usually marks the end of the interaction
    }
  });

  revalidatePath("/");
  return { success: true };
}

/**
 * Check if a user has reached their ticket limit
 */
export async function checkTicketLimitAction() {
  const session = await getSession();
  if (!session) return { limitReached: false, count: 0 };

  const count = await prisma.notification.count({
    where: {
      senderId: session.user.id,
      type: "SUPPORT_TICKET",
      resolved: false
    }
  });

  return { 
    limitReached: count >= 3,
    count 
  };
}


export async function banUserFromSupportAction(userId: string) {
    const session = await getSession();
    if (!session || session.user.role !== "admin") throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const newStatus = !user.isSupportBanned;

    await prisma.user.update({
        where: { id: userId },
        data: { isSupportBanned: newStatus }
    });

    revalidatePath("/");
    return { banned: newStatus };
}

export async function resolveThreadAction(threadId: string, status: "Resolved" | "Denied" = "Resolved") {
    const session = await getSession();
    if (!session || session.user.role !== "admin") throw new Error("Unauthorized");

    // We only want to mark the LATEST message as resolved/denied
    // to avoid showing the badge on every historical message in the consolidated thread.
    const latestMsg = await prisma.notification.findFirst({
        where: { threadId },
        orderBy: { createdAt: "desc" }
    });

    if (latestMsg) {
        await prisma.notification.update({
            where: { id: latestMsg.id },
            data: { 
                resolved: true,
                feedback: status // Overriding feedback field to store the custom status
            }
        });
    }

    revalidatePath("/");
    return { success: true };
}

export async function hideThreadAction(threadId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    await prisma.userThreadState.upsert({
        where: {
            userId_threadId: {
                userId: session.user.id,
                threadId
            }
        },
        update: { hidden: true },
        create: {
            userId: session.user.id,
            threadId,
            hidden: true
        }
    });

    revalidatePath("/");
    return { success: true };
}

export async function archiveThreadAction(threadId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const state = await prisma.userThreadState.findUnique({
        where: {
            userId_threadId: {
                userId: session.user.id,
                threadId: threadId
            }
        }
    });

    const newArchivedStatus = !(state?.archived ?? false);

    await prisma.userThreadState.upsert({
        where: {
            userId_threadId: {
                userId: session.user.id,
                threadId: threadId
            }
        },
        update: { archived: newArchivedStatus },
        create: {
            userId: session.user.id,
            threadId: threadId,
            archived: newArchivedStatus
        }
    });

    revalidatePath("/");
    return { success: true, archived: newArchivedStatus };
}

async function unhideThreadForAll(threadId: string) {
    // This finds all states for this thread and unhides/unarchives them
    await prisma.userThreadState.updateMany({
        where: { threadId },
        data: { 
            hidden: false,
            archived: false 
        }
    });
}

export async function updateLastSeenAction() {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastSeen: new Date() }
    });

    return { success: true };
}

export async function toggleMuteAction(threadId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const existing = await prisma.userThreadState.findUnique({
        where: {
            userId_threadId: {
                userId: session.user.id,
                threadId
            }
        }
    });

    await prisma.userThreadState.upsert({
        where: {
            userId_threadId: {
                userId: session.user.id,
                threadId
            }
        },
        update: { muted: !existing?.muted },
        create: {
            userId: session.user.id,
            threadId,
            muted: true
        }
    });

    revalidatePath("/");
    return { success: true, muted: !existing?.muted };
}

export async function getGroupParticipantsAction(chatGroupId: string) {
    const session = await getSession();
    if (!session) return [];

    const group = await prisma.chatGroup.findUnique({
        where: { id: chatGroupId },
        select: { courseId: true, name: true }
    });

    if (!group) return [];

    // If it's the global Broadcast, return all users
    if (group.name === "Broadcast" && !group.courseId) {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                lastSeen: true,
                role: true
            },
            take: 100 // Limit for performance
        });
        return users.map(u => ({
            user: u,
            role: u.role === "admin" ? "admin" : "member"
        }));
    }

    // Otherwise, get enrolled users for the course
    if (!group.courseId) return [];

    const enrollments = await prisma.enrollment.findMany({
        where: { courseId: group.courseId },
        include: {
            User: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    lastSeen: true,
                    role: true
                }
            }
        }
    });

    return enrollments.map(e => ({
        user: e.User,
        role: e.User.role === "admin" ? "admin" : "member"
    }));
}

export async function deleteThreadMessagesAction(threadId: string) {
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    // 1. Check if thread is a group
    const group = await prisma.chatGroup.findUnique({
        where: { id: threadId }
    });

    if (group) {
        throw new Error("Cannot delete group or broadcast chats");
    }

    // 2. Security: Ensure the user belongs to this thread if not admin
    if (session.user.role !== "admin") {
        const belongsToThread = await prisma.notification.findFirst({
            where: {
                threadId,
                OR: [
                    { senderId: session.user.id },
                    { recipientId: session.user.id }
                ]
            }
        });
        if (!belongsToThread) throw new Error("Unauthorized");
    }

    // 3. Delete all notifications in this thread
    await prisma.notification.deleteMany({
        where: { threadId }
    });

    // 4. Cleanup user thread states
    await prisma.userThreadState.deleteMany({
        where: { threadId }
    });

    revalidatePath("/");
    return { success: true };
}

export async function getChatVersionAction() {
    const session = await getSession();
    if (!session) return { version: null };

    const latest = await prisma.notification.findFirst({
        where: {
            OR: [
                { senderId: session.user.id },
                { recipientId: session.user.id },
                { chatGroupId: { not: null } },
            ]
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
    });

    return { version: latest?.createdAt.getTime() || 0 };
}

export async function syncChatAction(threadId?: string) {
    const session = await getSession();
    if (!session) return { threads: [], chat: null, version: 0 };

    // 1. Mark User as active (Combine with other DB operations later if needed)
    await prisma.user.update({
        where: { id: session.user.id },
        data: { lastSeen: new Date() }
    });

    // 2. Parallel fetch for efficiency
    const [threads, versionData] = await Promise.all([
        getThreadsAction(),
        getChatVersionAction()
    ]);

    // 3. Optional Chat Fetch
    let chat = null;
    if (threadId) {
        chat = await getThreadMessagesAction(threadId);
    }

    return {
        threads,
        chat,
        version: versionData.version
    };
}
