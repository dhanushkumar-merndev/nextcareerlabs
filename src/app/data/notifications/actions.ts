"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { NotificationType } from "@/generated/prisma";
import { getCache, setCache, invalidateCache, CHAT_CACHE_KEYS, getChatVersion, incrementChatVersion, getGlobalVersion, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";
import { TicketResponse } from "@/lib/types/components";
async function getSession() {
  return await auth.api.getSession({
    headers: await headers(),
  });
}

/**
 * Send a notification (Broadcast, Ticket, etc.)
 */


export async function sendNotificationAction(
  data: {
    title: string;
    content: string;
    type: NotificationType;
    courseId?: string;
    recipientId?: string;
    imageUrl?: string;
    threadId?: string;
    fileUrl?: string;
    fileName?: string;
  }
): Promise<TicketResponse> 
 {
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
      return {
  success: false,
  code: "TICKET_LIMIT_REACHED",
  minutesLeft,
};

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
    
    // Invalidate caches
    const recipientId = data.recipientId;
    const senderId = session.user.id;
    const isAdmin = session.user.role === "admin";

    await Promise.all([
        !isAdmin && invalidateCache(CHAT_CACHE_KEYS.THREADS(senderId)),
        !isAdmin && incrementChatVersion(senderId),
        recipientId && invalidateCache(CHAT_CACHE_KEYS.THREADS(recipientId)),
        recipientId && incrementChatVersion(recipientId),
        invalidateCache(CHAT_CACHE_KEYS.MESSAGES(threadId)),
        (isAdmin || data.type === "SUPPORT_TICKET") && invalidateAdminsCache()
    ]);
  }

  revalidatePath("/admin/resources");

  const signedNotification = await signMessageAttachments(notification);

  return { success: true, notification: signedNotification };
}

/**
 * Helper to invalidate cache and increment version for all admin users.
 * Ensures the admin sidebar updates in real-time when new tickets are created.
 */
export async function invalidateAdminsCache() {
    try {
        await Promise.all([
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
          invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR)
        ]);
        console.log(`[AdminSync] Incremented global admin chat version and invalidated shared sidebar cache.`);
    } catch (error) {
        console.error("[AdminSync] Failed to invalidate global admin cache:", error);
    }
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

  // Invalidate caches
  await Promise.all([
      invalidateCache(CHAT_CACHE_KEYS.THREADS(data.recipientId)),
      invalidateCache(CHAT_CACHE_KEYS.MESSAGES(data.threadId)),
      incrementChatVersion(data.recipientId),
      invalidateAdminsCache() // Update global admin cache
  ]);

  // Mark all messages in thread as read for admin? Or just specific ones?
  // For now, let's leave read status logic to the view.

  const signedNotification = await signMessageAttachments(notification);

  revalidatePath("/admin/resources");
  return { success: true, notification: signedNotification };
}

// NEW ACTIONS

export async function getThreadsAction(clientVersion?: string) {
  const session = await getSession();
  if (!session) return { threads: [], version: "0", enrolledCourses: [], presence: null };

  let currentVersion = await getChatVersion(session.user.id);
  const isAdmin = session.user.role === "admin";

  if (isAdmin) {
      // Admins ONLY use the global version to prevent redundant per-user versions in Redis/LocalStorage
      currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION);
  }
  
  // If client already has the latest version, don't download everything
  if (clientVersion && clientVersion === currentVersion) {
      console.log(`[getThreadsAction] Version Match (${clientVersion}) for user ${session.user.id}. Returning NOT_MODIFIED.`);
      return { status: "not-modified", version: currentVersion };
  }

  const cacheKey = isAdmin 
    ? GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR
    : CHAT_CACHE_KEYS.THREADS(session.user.id);
  
  const cachedData = await getCache<any>(cacheKey);

  if (cachedData && cachedData.version === currentVersion) {
    console.log(`[getThreadsAction] Redis Cache HIT (Fresh) for user ${session.user.id}.`);
    return cachedData;
  }

  console.log(`[getThreadsAction] Redis Cache MISS for user ${session.user.id}. Fetching from Prisma DB...`);

  // Ensure default "Broadcast" group exists (Only on cache miss for admins)
  if (isAdmin) {
      const missingGroupsCount = await prisma.course.count({
          where: { status: "Published", chatGroups: { none: {} } }
      });
      const broadcastExist = await prisma.chatGroup.findFirst({
          where: { name: "Broadcast", courseId: null },
          select: { id: true }
      });
      
      if (missingGroupsCount > 0 || !broadcastExist) {
          if (!broadcastExist) {
              await prisma.chatGroup.create({ data: { name: "Broadcast" } });
          }
          const missingGroups = await prisma.course.findMany({
              where: { status: "Published", chatGroups: { none: {} } }
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
           revalidatePath("/admin/resources");
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

  const dbStartTime = Date.now();
  // 1. Get unique threads and their latest message timestamp
  const threadMaxDates = await prisma.notification.groupBy({
    by: ['threadId'],
    where: {
      ...whereClause as any,
      threadId: { not: null }
    },
    _max: { createdAt: true }
  });
  console.log(`[getThreadsAction] GroupBy Threads took ${Date.now() - dbStartTime}ms`);

  const threadIds = threadMaxDates.map(t => t.threadId!).filter(Boolean);
  
  // 5. BATCH FETCH CHAT GROUPS WHERE CLAUSE
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

  // 2. PARALLEL FETCH REMAINING DATA
  const [
    latestMsgs,
    unresolvedTicketsResults,
    studentMsgs,
    groups,
    userStates,
    enrollmentData,
    latestNotification
  ] = await Promise.all([
    // Latest Messages (The big one)
    threadIds.length > 0 ? prisma.notification.findMany({
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
    }) : Promise.resolve([]),

    // Unresolved Tickets
    threadIds.length > 0 ? prisma.notification.findMany({
      where: {
        threadId: { in: threadIds },
        type: "SUPPORT_TICKET",
        resolved: false
      },
      select: { threadId: true }
    }) : Promise.resolve([]),

    // Student Info (Admin only)
    isAdmin && threadIds.length > 0 ? prisma.notification.findMany({
      where: {
        threadId: { in: threadIds },
        sender: {
            OR: [ { role: null }, { role: { not: "admin" } } ]
        }
      },
      distinct: ['threadId'],
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, image: true, email: true } } }
    }) : Promise.resolve([]),

    // Chat Groups
    prisma.chatGroup.findMany({
      where: groupWhere,
      include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } }
    }),

    // User Thread States
    prisma.userThreadState.findMany({ where: { userId: session.user.id } }),

    // Enrolled Courses for Meta
    prisma.enrollment.findMany({
      where: { userId: session.user.id, status: "Granted" },
      include: { Course: { select: { id: true, title: true } } }
    }),

    // Version Check
    prisma.notification.findFirst({
        where: {
            OR: [
                { recipientId: session.user.id },
                { senderId: session.user.id },
                { type: "BROADCAST" }
            ]
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
    })
  ]);
  console.log(`[getThreadsAction] Big Parallel Fetch took ${Date.now() - dbStartTime}ms (Threads: ${threadIds.length})`);

  // Transform Maps
  const unresolvedMap: Record<string, number> = {};
  unresolvedTicketsResults.forEach(msg => {
      if (msg.threadId) unresolvedMap[msg.threadId] = (unresolvedMap[msg.threadId] || 0) + 1;
  });

  const studentMap: Record<string, any> = {};
  if (isAdmin) {
      studentMsgs.forEach(m => { if (m.threadId) studentMap[m.threadId] = m.sender; });
  }

  const enrollmentCourses = enrollmentData.map(e => e.Course);
  const stateMap = new Map((userStates as any[]).map(s => [s.threadId, s]));

  // Combine results in memory
  const threadDetails = (latestMsgs as any[]).map(latestMsg => {
    const threadId = latestMsg.threadId!;
    let display = { name: "Support Team", image: "", email: "support@platform.com" };

    if (latestMsg.chatGroupId && latestMsg.chatGroup) {
        display = {
            name: latestMsg.chatGroup.name,
            image: latestMsg.chatGroup.imageUrl || "",
            email: "Group"
        };
    } else if (isAdmin) {
      let targetUser = (latestMsg.senderId !== session.user.id) ? latestMsg.sender : (latestMsg.recipient || studentMap[threadId]);
      if (targetUser) {
        display = { name: targetUser.name || targetUser.email || "Student", image: targetUser.image || "", email: targetUser.email };
      } else {
        display = { name: "Ticket User", image: "", email: "" };
      }
    }

    const isThreadResolved = !(unresolvedMap[threadId] > 0);
    
    // Improved preview logic for attachments and statuses
    let previewMessage = latestMsg.content || "";
    
    // Status-based previews (Feedback/Resolution)
    if (latestMsg.feedback) {
        const f = latestMsg.feedback.toLowerCase().trim();
        if (f.includes("positive feedback") || ["helpful", "yes"].includes(f)) {
            previewMessage = "Positive Feedback";
        } else if (f.includes("negative feedback") || ["more help", "no"].includes(f)) {
            previewMessage = "Negative Feedback";
        } else if (f === "resolved") {
            previewMessage = "Issue Resolved";
        } else if (f === "denied") {
            previewMessage = "Issue Denied";
        }
    }

    if (!previewMessage.trim()) {
        if (latestMsg.imageUrl) previewMessage = "Image";
        else if (latestMsg.fileUrl) previewMessage = `PDF (${latestMsg.fileName || "Document"})`;
    }

    return {
      threadId,
      lastMessage: previewMessage,
      updatedAt: latestMsg.createdAt,
      resolved: isThreadResolved, 
      isGroup: !!latestMsg.chatGroupId,
      type: latestMsg.chatGroupId ? "Group" : (isAdmin ? "Ticket" : "Support"),
      display
    };
  });

  const uniqueGroupsMap = new Map<string, any>();
  groups.forEach(g => {
      const key = g.courseId ? g.id : `GLOBAL_NAME_${g.name}`;
      if (!uniqueGroupsMap.has(key)) uniqueGroupsMap.set(key, g);
  });

  const groupThreads = Array.from(uniqueGroupsMap.values()).map(g => {
      const threadId = g.id;
      const lastMsg = g.messages[0];
      
      let previewMessage = lastMsg?.content || "No messages yet";
      if (lastMsg?.feedback) {
          const f = lastMsg.feedback.toLowerCase().trim();
          if (["helpful", "yes"].includes(f)) previewMessage = "Positive Feedback";
          else if (["more help", "no"].includes(f)) previewMessage = "Negative Feedback";
          else if (f === "resolved") previewMessage = "Issue Resolved";
          else if (f === "denied") previewMessage = "Issue Denied";
      }

      if (lastMsg && !lastMsg.content?.trim()) {
          if (lastMsg.imageUrl) previewMessage = "Image";
          else if (lastMsg.fileUrl) previewMessage = `PDF (${lastMsg.fileName || "Document"})`;
      }

      return {
        threadId,
        lastMessage: previewMessage,
        updatedAt: lastMsg?.createdAt || g.createdAt,
        resolved: true,
        isGroup: true,
        type: "Group",
        display: { name: g.name, image: g.imageUrl || "", email: "" }
      };
  });

  const allThreadsMap = new Map<string, any>();
  [...threadDetails, ...groupThreads].forEach(t => {
      const state = stateMap.get(t.threadId);
      const merged = { ...t, archived: state?.archived ?? false,  hidden: state?.hidden ?? false, muted: state?.muted ?? false };
      const existing = allThreadsMap.get(t.threadId);
      if (!existing || new Date(merged.updatedAt) > new Date(existing.updatedAt)) {
          allThreadsMap.set(t.threadId, merged);
      }
  });

  const finalThreads = Array.from(allThreadsMap.values())
    .filter(t => !t.hidden)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const result = { 
      threads: finalThreads, 
      version: currentVersion || (latestNotification?.createdAt.getTime() ?? 0).toString(),
      enrolledCourses: enrollmentCourses,
      presence: null 
  };

  await setCache(cacheKey, result, 21600); // 6 hours
  return result;
}

/**
 * NEW: Manual or triggered initialization of chat groups.
 * Call this when a course is published or when an admin enters the dashboard.
 */

export async function getThreadMessagesAction(threadId: string, before?: string) {
  const session = await getSession();
  if (!session) return { messages: [], state: null, nextCursor: null };

  const isAdmin = session.user.role === "admin";
  let cacheKey = !before ? CHAT_CACHE_KEYS.MESSAGES(threadId) : null;

  if (cacheKey && isAdmin) {
      const gv = await getGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION);
      cacheKey = `${cacheKey}:${gv}`;
  }

  if (cacheKey) {
    const cached = await getCache<any>(cacheKey);
    if (cached) {
        console.log(`[getThreadMessagesAction] Redis Cache HIT for thread ${threadId}.`);
        return cached;
    }
    console.log(`[getThreadMessagesAction] Redis Cache MISS for thread ${threadId}. Fetching from Prisma DB...`);
  }

  let referenceDate = before ? new Date(before) : new Date();

  // If initial load (no cursor), find the latest message to start the window from there
  if (!before) {
    const dbFetchStart = Date.now();
    const latest = await prisma.notification.findFirst({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
    });
    console.log(`[getThreadMessagesAction] Latest Msg Fetch took ${Date.now() - dbFetchStart}ms`);
    
    if (latest) {
        // Set reference date to slightly after the latest message to ensure it's included
        referenceDate = new Date(latest.createdAt.getTime() + 1000);
    }
  }

  const sevenDaysAgo = new Date(referenceDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const mainDbStart = Date.now();
  const [messages, state, oldestEver] = await Promise.all([
    prisma.notification.findMany({
      where: { 
          threadId,
          createdAt: {
              lt: referenceDate,
              gte: sevenDaysAgo
          }
      },
      include: {
        sender: { select: { id: true, name: true, image: true, role: true, isSupportBanned: true } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.userThreadState.findUnique({
      where: {
        userId_threadId: {
          userId: session.user.id,
          threadId
        }
      }
    }),
    prisma.notification.findFirst({
        where: { threadId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true }
    })
  ]);
  console.log(`[getThreadMessagesAction] DB Fetch (Msgs + State + Oldest) took ${Date.now() - mainDbStart}ms (Count: ${messages.length})`);

  const nextCursor = (oldestEver && oldestEver.createdAt < sevenDaysAgo) ? sevenDaysAgo.toISOString() : null;
  const dbDuration = Date.now() - mainDbStart;
  console.log(`[getThreadMessagesAction] DB Operations total took ${dbDuration}ms.`);

  const signedMessages = await Promise.all(messages.map(m => signMessageAttachments(m)));

  const result = {
    messages: [...signedMessages].reverse(),
    state: {
      isMuted: state?.muted ?? false,
      isArchived: state?.archived ?? false,
      isHidden: state?.hidden ?? false
    },
    nextCursor
  };

  if (cacheKey) {
    await setCache(cacheKey, result, 21600); // 6 hours
  }

  return result;
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

    revalidatePath("/admin/resources");
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


import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3 } from "@/lib/S3Client";
import { env } from "@/lib/env";
import { tigris } from "@/lib/tigris";

async function signMessageAttachments(msg: any) {
  if (!msg) return msg;

  const signedMsg = { ...msg };

  if (signedMsg.imageUrl && !signedMsg.imageUrl.startsWith("http")) {
    try {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: signedMsg.imageUrl,
      });
      signedMsg.imageUrl = await getSignedUrl(tigris, command, { expiresIn: 3600 });
    } catch (e) {
      console.error("[signMessageAttachments] Image signing failed:", e);
    }
  }

  if (signedMsg.fileUrl && !signedMsg.fileUrl.startsWith("http")) {
    try {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: signedMsg.fileUrl,
      });
      signedMsg.fileUrl = await getSignedUrl(tigris, command, { expiresIn: 3600 });
    } catch (e) {
      console.error("[signMessageAttachments] File signing failed:", e);
    }
  }

  return signedMsg;
}

export async function deleteMessageAction(id: string) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const isAdmin = session.user.role === "admin";
  
  // 1. Fetch message to check for attachments and permissions
  const message = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, senderId: true, recipientId: true, imageUrl: true, fileUrl: true, threadId: true }
  });

  if (!message) return { success: false, error: "Message not found" };

  // Permission Check: Admin can delete anything. User can delete if they sent or received it.
  if (!isAdmin && message.senderId !== session.user.id && message.recipientId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
  }

  // 2. Delete from S3 if attachment exists
  try {
      if (message.imageUrl) {
          // Chat images are now in the private bucket
          const command = new DeleteObjectCommand({
              Bucket: env.S3_BUCKET_NAME,
              Key: message.imageUrl,
          });
          await S3.send(command);
      }
      if (message.fileUrl) {
           const command = new DeleteObjectCommand({
              Bucket: env.S3_BUCKET_NAME,
              Key: message.fileUrl,
          });
          await S3.send(command);
      }
  } catch (error) {
      // Proceed with DB deletion anyway
  }

  // 3. Delete from DB
  await prisma.notification.delete({
    where: { id }
  });

  // Invalidate caches
  await Promise.all([
      !isAdmin && invalidateCache(CHAT_CACHE_KEYS.THREADS(session.user.id)),
      !isAdmin && incrementChatVersion(session.user.id),
      message.recipientId && invalidateCache(CHAT_CACHE_KEYS.THREADS(message.recipientId)),
      message.recipientId && incrementChatVersion(message.recipientId),
      invalidateCache(CHAT_CACHE_KEYS.MESSAGES(message.threadId || "")),
      isAdmin && invalidateAdminsCache()
  ]);

  revalidatePath("/admin/resources");
  return { success: true };
}


export async function editMessageAction(
  id: string, 
  newContent: string, 
  imageUrl?: string | null,
  fileUrl?: string | null,
  fileName?: string | null
) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const isAdmin = session.user.role === "admin";
  const message = await prisma.notification.findUnique({ where: { id } });
  if (!message) throw new Error("Message not found");

  if (message.senderId !== session.user.id && !isAdmin) throw new Error("Unauthorized");
  // NEW: Only admins can edit messages
  if (!isAdmin) throw new Error("Only admins can edit messages");

  await prisma.notification.update({
    where: { id },
    data: { 
        content: newContent,
        imageUrl: imageUrl, 
        fileUrl: fileUrl,
        fileName: fileName
    }
  });

  // Invalidate
  const threadId = message.threadId || "";
  await Promise.all([
      invalidateCache(CHAT_CACHE_KEYS.MESSAGES(threadId)),
      isAdmin && invalidateAdminsCache(),
      !isAdmin && invalidateCache(CHAT_CACHE_KEYS.THREADS(session.user.id)),
      !isAdmin && incrementChatVersion(session.user.id),
      message.recipientId && invalidateCache(CHAT_CACHE_KEYS.THREADS(message.recipientId)),
      message.recipientId && incrementChatVersion(message.recipientId)
  ]);

  revalidatePath("/admin/resources");
  return { success: true };
}



/**
 * Resolve a ticket
 */
export async function resolveTicketAction(id: string, status: "Resolved" | "Denied" = "Resolved") {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const n = await prisma.notification.update({
    where: { id },
    data: { 
        resolved: true,
        feedback: status
    }
  });

  // Invalidate
  await Promise.all([
      n.senderId && invalidateCache(CHAT_CACHE_KEYS.THREADS(n.senderId)),
      n.senderId && incrementChatVersion(n.senderId),
      invalidateCache(CHAT_CACHE_KEYS.MESSAGES(n.threadId || "")),
      invalidateAdminsCache()
  ]);

  revalidatePath("/admin/resources");
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

  if (data.feedback.length > 300) {
    throw new Error("Feedback exceeds 300 characters");
  }

  const n = await prisma.notification.update({
    where: { id: data.notificationId },
    data: { 
      feedback: data.feedback,
      resolved: ["More Help"].includes(data.feedback) ? false : true 
    }
  });

  // Invalidate
  await Promise.all([
      invalidateCache(CHAT_CACHE_KEYS.THREADS(session.user.id)),
      invalidateCache(CHAT_CACHE_KEYS.MESSAGES(n.threadId || "")),
      incrementChatVersion(session.user.id),
      invalidateAdminsCache()
  ]);

  revalidatePath("/admin/resources");
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

    revalidatePath("/admin/resources");
    return { banned: newStatus };
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

    // Invalidate
    const isAdmin = session.user.role === "admin";
    await Promise.all([
        invalidateCache(CHAT_CACHE_KEYS.THREADS(session.user.id)),
        invalidateCache(CHAT_CACHE_KEYS.MESSAGES(threadId)),
        incrementChatVersion(session.user.id),
        isAdmin && invalidateAdminsCache()
    ]);

    revalidatePath("/admin/resources");
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

export async function getGroupParticipantsAction(chatGroupId: string) {
    const session = await getSession();
    if (!session) return [];

    const cacheKey = CHAT_CACHE_KEYS.PARTICIPANTS(chatGroupId);
    const cached = await getCache<any[]>(cacheKey);
    if (cached) {
        console.log(`[Redis] Cache HIT for participants: ${chatGroupId}`);
        return cached;
    }

    const group = await prisma.chatGroup.findUnique({
        where: { id: chatGroupId },
        select: { id: true, courseId: true, name: true }
    });

    if (!group) return [];

    let result: any[] = [];

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
        result = users.map(u => ({
            user: u,
            role: u.role === "admin" ? "admin" : "member"
        }));
    } else if (group.courseId) {
        // Otherwise, get enrolled users for the course
        const enrollments = await prisma.enrollment.findMany({
            where: { courseId: group.courseId, status: "Granted" },
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

        result = enrollments.map(e => ({
            user: e.User,
            role: e.User.role === "admin" ? "admin" : "member"
        }));
    }

    if (result.length > 0) {
        await setCache(cacheKey, result, 21600); // 6 hours
    }

    return result;
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

    // Invalidate
    const isAdmin = session.user.role === "admin";
    await Promise.all([
        invalidateCache(CHAT_CACHE_KEYS.THREADS(session.user.id)),
        invalidateCache(CHAT_CACHE_KEYS.MESSAGES(threadId)),
        incrementChatVersion(session.user.id),
        isAdmin && invalidateAdminsCache()
    ]);

    revalidatePath("/admin/resources");
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



