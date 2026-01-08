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
export async function sendNotificationAction(data: {
  title: string;
  content: string;
  type: NotificationType;
  courseId?: string;
  recipientId?: string;
  imageUrl?: string;
  threadId?: string;
  fileUrl?: string;
  fileName?: string;
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
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0); 
      const minutesLeft = Math.ceil((nextDay.getTime() - now.getTime()) / (1000 * 60));
      return { success: false, error: "TICKET_LIMIT_REACHED", minutesLeft };
    }

    // Ensure the thread is visible for both parties
    // Moved to be called once at the end or conditionally
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
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      threadId: threadId,
      chatGroupId: chatGroupId
    },
  });



  // Unhide for everyone (if it was hidden) - ONLY ONCE
  if (threadId) {
    await unhideThreadForAll(threadId);
  }

  revalidatePath("/");
  return { success: true, notification };
}

export async function replyToTicketAction(data: {
  threadId: string;
  recipientId: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
}) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") throw new Error("Unauthorized");

  const notification = await prisma.notification.create({
    data: {
      title: `RE: Support Ticket`,
      content: data.content,
      type: "ADMIN_REPLY",
      senderId: session.user.id,
      recipientId: data.recipientId,
      threadId: data.threadId,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
    },
  });

  // Unhide for everyone (if it was hidden)
  await unhideThreadForAll(data.threadId);

  // Mark all messages in thread as read for admin? Or just specific ones?
  // For now, let's leave read status logic to the view.

  revalidatePath("/");
  return { success: true, notification };
}

// NEW ACTIONS

export async function getThreadsAction() {
  const session = await getSession();
  if (!session) return [];
  const isAdmin = session.user.role === "admin";

  // Ensure default "Broadcast" group exists
  if (isAdmin) {
      const globGroups = await prisma.chatGroup.findMany({
          where: { courseId: null }
      });
      const names = globGroups.map(g => g.name.toLowerCase());
      
      if (!names.includes("broadcast")) {
          await prisma.chatGroup.create({
              data: { name: "Broadcast" }
          });
      }

      // SELF-HEAL: Ensure all Published courses have a Broadcast Group
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
  const whereClause: any = isAdmin 
    ? { 
        OR: [
            { type: "SUPPORT_TICKET" }, 
            { type: "ADMIN_REPLY" }, 
            { 
                type: "GROUP_CHAT",
                NOT: {
                    chatGroup: {
                        name: { equals: "Support", mode: "insensitive" }
                    }
                }
            }
        ],
      }
    : { 
        OR: [
           { 
                senderId: session.user.id,
                NOT: {
                    chatGroup: {
                        name: { equals: "Support", mode: "insensitive" }
                    }
                }
           }, 
           { 
                recipientId: session.user.id,
                NOT: {
                    chatGroup: {
                        name: { equals: "Support", mode: "insensitive" }
                    }
                }
           }
        ]
      };

  // 1. Get unique threads and their latest message timestamp
  const threadMaxDates = await prisma.notification.groupBy({
    by: ['threadId'],
    where: {
      ...whereClause as any,
      threadId: { not: null }
    },
    _max: { createdAt: true }
  });

  const threadIds = threadMaxDates.map(t => t.threadId!).filter(Boolean);
  
  // 2. BATCH FETCH LATEST MESSAGES
  let latestMsgs: any[] = [];
  if (threadIds.length > 0) {
      latestMsgs = await prisma.notification.findMany({
        where: {
          OR: threadMaxDates.map(t => ({
            threadId: t.threadId,
            createdAt: t._max.createdAt!
          }))
        },
        include: {
          sender: { select: { id: true, name: true, image: true, email: true } },
          recipient: { select: { id: true, name: true, image: true, email: true } },
          chatGroup: true
        }
      });
  }



  // 4. BATCH FETCH UNRESOLVED TICKET COUNTS
  const unresolvedTicketsResults = threadIds.length > 0 ? await prisma.notification.findMany({
    where: {
      threadId: { in: threadIds },
      type: "SUPPORT_TICKET",
      resolved: false
    },
    select: { threadId: true }
  }) : [];

  const unresolvedMap: Record<string, number> = {};
  unresolvedTicketsResults.forEach(msg => {
      if (msg.threadId) {
          unresolvedMap[msg.threadId] = (unresolvedMap[msg.threadId] || 0) + 1;
      }
  });

  // 5. BATCH FETCH STUDENT INFO (ADMIN ONLY)
  let studentMap: Record<string, any> = {};
  if (isAdmin && threadIds.length > 0) {
      const studentMsgs = await prisma.notification.findMany({
          where: {
              threadId: { in: threadIds },
              sender: {
                  OR: [
                      { role: null },
                      { role: { not: "admin" } }
                  ]
              }
          },
          distinct: ['threadId'],
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, image: true, email: true } } }
      });
      studentMsgs.forEach(m => {
          if (m.threadId) studentMap[m.threadId] = m.sender;
      });
  }

  // 5. BATCH FETCH CHAT GROUPS (Already fairly efficient, but let's sync)
  let groupWhere: any = { name: { not: "Support", mode: "insensitive" } };
  if (!isAdmin) {
    const userEnrollments = await prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "Granted" },
      select: { courseId: true }
    });
    const courseIds = userEnrollments.map(e => e.courseId);
    groupWhere = {
        AND: [
            { name: { not: "Support" } },
            { OR: [{ courseId: { in: courseIds } }, { courseId: null }] }
        ]
    };
  }

  // Combine results in memory
  const threadDetails = latestMsgs.map(latestMsg => {
    const threadId = latestMsg.threadId!;
    // unreadCount removed as per request
    
    
    let display = {
      name: "Support Team",
      image: "",
      email: "support@platform.com"
    };

    if (latestMsg.chatGroupId && latestMsg.chatGroup) {
        display = {
            name: latestMsg.chatGroup.name,
            image: latestMsg.chatGroup.imageUrl || "",
            email: "Group"
        };
    } else if (isAdmin) {
      let targetUser = null;
      if (latestMsg.senderId !== session.user.id) {
          targetUser = latestMsg.sender;
      } else if (latestMsg.recipient) {
          targetUser = latestMsg.recipient;
      }
      
      // Fallback to the first student who messaged in this thread
      if (!targetUser) {
          targetUser = studentMap[threadId];
      }

      if (targetUser) {
        display = {
           name: targetUser.name || targetUser.email || "Student",
           image: targetUser.image || "",
           email: targetUser.email
        };
      } else {
         display = { name: "Ticket User", image: "", email: "" };
      }
    }

    const isThreadResolved = !(unresolvedMap[threadId] > 0);

    return {
      threadId,
      lastMessage: latestMsg.content,
      updatedAt: latestMsg.createdAt,
      resolved: isThreadResolved, 
      isGroup: !!latestMsg.chatGroupId,
      type: latestMsg.chatGroupId ? "Group" : (isAdmin ? "Ticket" : "Support"),
      display
    };
  });

  // 6. Handle groups that might not have messages yet
  const groups = await prisma.chatGroup.findMany({
    where: groupWhere,
    include: {
        messages: {
            take: 1,
            orderBy: { createdAt: 'desc' }
        }
    }
  });

  const uniqueGroupsMap = new Map<string, any>();
  groups.forEach(g => {
      const key = g.courseId ? g.id : `GLOBAL_NAME_${g.name}`;
      if (!uniqueGroupsMap.has(key)) uniqueGroupsMap.set(key, g);
  });

  const groupThreads = Array.from(uniqueGroupsMap.values()).map(g => {
      const threadId = g.id;
      const lastMsg = g.messages[0];
      
      return {
        threadId,
        lastMessage: lastMsg?.content || "No messages yet",
        updatedAt: lastMsg?.createdAt || g.createdAt,
        resolved: true,
        isGroup: true,
        type: "Group",
        display: {
            name: g.name,
            image: g.imageUrl || "",
            email: ""
        }
      };
  });

  // 7. Sync user thread states (archived, hidden)
  const userStates = await prisma.userThreadState.findMany({
      where: { userId: session.user.id }
  });
  const stateMap = new Map(userStates.map(s => [s.threadId, s]));

  // Combine and deduplicate (in case a thread is both in details and groups)
  const allThreadsMap = new Map<string, any>();
  
  [...threadDetails, ...groupThreads].forEach(t => {
      const state = stateMap.get(t.threadId);
      const merged = {
          ...t,
          archived: state?.archived ?? false,
          hidden: state?.hidden ?? false,
          muted: state?.muted ?? false
      };
      
      // If we have duplicates, keep the one with the later updatedAt
      const existing = allThreadsMap.get(t.threadId);
      if (!existing || new Date(merged.updatedAt) > new Date(existing.updatedAt)) {
          allThreadsMap.set(t.threadId, merged);
      }
  });

  const finalThreads = Array.from(allThreadsMap.values())
    .filter(t => !t.hidden)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Consolidate metadata
  const enrollments = await prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "Granted" },
      include: { Course: { select: { id: true, title: true } } }
  });
  const enrolledCourses = enrollments.map(e => e.Course);

  const latestNotification = await prisma.notification.findFirst({
      where: {
          OR: [
              { recipientId: session.user.id },
              { senderId: session.user.id },
              { type: "BROADCAST" }
          ]
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
  });

  return { 
      threads: finalThreads, 
      version: latestNotification?.createdAt.getTime() ?? Date.now(),
      enrolledCourses,
      presence: null 
  };
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
      sender: { select: { id: true, name: true, image: true, role: true, isSupportBanned: true } }
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
  
  // Read status is now handled separately and throttled via markThreadAsReadAction

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

export async function getEnrolledCoursesAction() {
    const session = await getSession();
    if (!session) return [];

    const enrollments = await prisma.enrollment.findMany({
        where: { 
            userId: session.user.id,
            status: "Granted"
        },
        include: {
            Course: {
                select: {
                    id: true,
                    title: true
                }
            }
        }
    });

    return enrollments.map(e => e.Course);
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
        filters?.type ? { type: filters.type } : {}
      ]
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      course: {
        select: { title: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: filters?.take ?? 50
  });

  return notifications;
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
      resolved: data.feedback === "More Help" ? false : true 
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

    // Robust resolution: mark ALL notifications in this thread as resolved
    await prisma.notification.updateMany({
        where: { threadId },
        data: { 
            resolved: true,
            feedback: status 
        }
    });

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

export async function getChatVersionAction(threadId?: string) {
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

    let otherPresence = null;

    return { 
        version: latest?.createdAt.getTime() || 0,
        otherPresence 
    };
}

export async function syncChatAction(threadId?: string) {
    const session = await getSession();
    if (!session) return { threads: [], chat: null, version: 0 };



    // 2. Parallel fetch for efficiency
    const [threads, versionData, enrolledCourses] = await Promise.all([
        getThreadsAction(),
        getChatVersionAction(),
        getEnrolledCoursesAction()
    ]);

    // 3. Optional Chat Fetch
    let chat = null;
    if (threadId) {
        chat = await getThreadMessagesAction(threadId);
    }

    return {
        threads,
        chat,
        version: versionData.version,
        enrolledCourses
    };
}


