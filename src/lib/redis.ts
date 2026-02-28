import Redis from "ioredis";
import { env } from "./env";

const globalForRedis = global as unknown as { redis: Redis | null };

const getRedisInstance = () => {
    if (typeof window !== "undefined") return null;
    if (!env.REDIS_URL) return null;

    try {
        const client = new Redis(env.REDIS_URL, {
            connectTimeout: 5000,
            commandTimeout: 2000,
            maxRetriesPerRequest: 3,
            // Allow a few retries instead of failing immediately forever
            retryStrategy: (times) => {
                if (times > 5) return null; // Stop after 5 attempts
                return Math.min(times * 100, 2000); // 100ms, 200ms, 300ms
            },
            lazyConnect: true
        });

        client.on("error", (err) => {
            if (err.message.includes("ECONNREFUSED")) {
                console.warn("[Redis] Server unreachable. Falling back to DB.");
            } else if (err.message.includes("Connection is closed")) {
                 // Suppress noise, handled in commands
            } else {
                console.error("[Redis] Connection Error:", err.message);
            }
        });

        client.on("connect", () => console.log("[Redis] Connected."));
        client.on("ready", () => console.log("[Redis] Ready for commands."));

        return client;
    } catch (error) {
        return null;
    }
};

export const redis = globalForRedis.redis || getRedisInstance();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Cache keys for resources
export const CHAT_CACHE_KEYS = {
  THREADS: (userId: string) => `chat:threads:${userId}`,
  MESSAGES: (threadId: string) => `chat:messages:${threadId}`,
  VERSION: (userId: string) => `chat:version:${userId}`,
  PARTICIPANTS: (groupId: string) => `chat:participants:${groupId}`,
};

export const GLOBAL_CACHE_KEYS = {
  COURSES_LIST: "global:courses:list",
  ADMIN_COURSES_LIST: "admin:courses:list",
  COURSES_VERSION: "global:version:courses",
  COURSE_DETAIL: (slug: string) => `global:course:${slug}`,
  COURSE_DETAIL_BY_ID: (id: string) => `global:course:id:${id}`,
  ADMIN_ANALYTICS: "global:admin:analytics",
  ADMIN_AVERAGE_PROGRESS: "global:admin:average_progress",
  ADMIN_DASHBOARD_STATS: "global:admin:dashboard:stats",
  ADMIN_ANALYTICS_VERSION: "global:version:analytics",
  ADMIN_DASHBOARD_STATS_VERSION: "global:version:admin:dashboard:stats",
  ADMIN_COURSES_VERSION: "global:version:admin:courses",
  ADMIN_ENROLLMENTS_LIST: "admin:enrollments:list",
  ADMIN_ENROLLMENTS_VERSION: "global:version:admin:enrollments",
  ADMIN_RECENT_COURSES_VERSION: "global:version:admin:recent_courses",
  ADMIN_CHAT_THREADS_VERSION: "global:version:admin:chat_threads",
  ADMIN_CHAT_MESSAGES_VERSION: "global:version:admin:chat_messages",
  ADMIN_CHAT_SIDEBAR: "global:admin:chat_sidebar",
  ADMIN_USERS_LIST: "admin:users:list",
  ADMIN_USERS_VERSION: "global:version:admin:users",
  USER_ENROLLMENTS: (userId: string, version?: string) => version ? `user:enrollments:${userId}:${version}` : `user:enrollments:${userId}`,
  USER_VERSION: (userId: string) => `user:version:${userId}`,
  ADMIN_TASK_STATUS: "global:admin:task_status",
  ADMIN_DASHBOARD_ALL: "global:admin:dashboard:all",
  ADMIN_DASHBOARD_VERSION: "global:version:admin:dashboard:all",
  AUTH_SESSION_VERSION: "global:version:auth_session",
};

const OPERATION_TIMEOUT = 500;

async function withTimeout<T>(promise: Promise<T>, defaultValue: T): Promise<T> {
  // If redis is explicitly in a "closed" or "end" state, don't even try
  if (redis && (redis.status === "end" || redis.status === "close")) {
      // Potentially attempt a manual reconnect if it's dead but still the instance we're using
      try { redis.connect().catch(() => {}); } catch(e) {}
      return defaultValue;
  }

  const timeoutPromise = new Promise<T>((resolve) =>
    setTimeout(() => resolve(defaultValue), OPERATION_TIMEOUT)
  );
  try {
    return await Promise.race([promise.catch((err) => {
        // If it's a connection error, log minimally and return defaultValue
        if (err.message.includes("Connection is closed")) {
            return defaultValue;
        }
        throw err;
    }), timeoutPromise]);
  } catch (e: any) {
    if (!e?.message?.includes("Connection is closed")) {
        console.error(`[Redis] Operation Timeout/Failure (${e?.message || 'Unknown error'})`);
    }
    return defaultValue;
  }
}

export async function setCache<T>(key: string, data: T, ttl: number = 1800) {
  if (!redis) return;
  try {
    await withTimeout(redis.set(key, JSON.stringify(data), "EX", ttl), null);
  } catch (error) {
    // Silent fail
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await withTimeout(redis.get(key), null);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export async function invalidateCache(key: string) {
  if (!redis) return;
  try {
    await withTimeout(redis.del(key), null);
  } catch (error) {
    // Silent fail
  }
}

/**
 * Versioning helpers for Chat Sync
 */
export async function getChatVersion(userId: string): Promise<string> {
    if (!redis) return "0";
    const version = await getCache<string>(CHAT_CACHE_KEYS.VERSION(userId));
    return version || "0";
}

export async function incrementChatVersion(userId: string) {
    if (!redis) return;
    const nextVersion = Date.now().toString();
    await setCache(CHAT_CACHE_KEYS.VERSION(userId), nextVersion, 86400 * 7); // Store for 7 days
}

export async function getGlobalVersion(key: string): Promise<string> {
    if (!redis) return "0";
    let version = await getCache<string>(key);
    
    // Auto-initialize if null to prevent "Server: 0" vs "Client: null" mismatches
    if (version === null) {
        version = Date.now().toString();
        await setCache(key, version, 86400 * 30); // Store for 30 days
        console.log(`[Redis] Initialized missing version key="${key}" value="${version}"`);
    } else {
        console.log(`[Redis] getGlobalVersion key="${key}" value="${JSON.stringify(version)}"`);
    }
    
    return version || "0";
}


export async function incrementGlobalVersion(key: string) {
    if (!redis) return;
    const nextVersion = Date.now().toString();
    await setCache(key, nextVersion, 86400 * 7); // Store for 7 days
}

/**
 * Centralized Admin Cache Invalidation
 * Invalidates all admin-related keys and increments all admin-related versions.
 */
export async function invalidateAllAdminCache() {
    if (!redis) return;

    const invalidations: Promise<any>[] = [
        // 1. Invalidate Primary Data Keys
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_USERS_LIST}:enrolled`),
        invalidateCache("admin:admins:list"),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_AVERAGE_PROGRESS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),

        // 2. Increment Version Triggers
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_USERS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
    ];

    await Promise.all(invalidations);
    console.log("[Redis] Global Admin Cache Invalidated.");
}

/**
 * Optimized user-specific invalidation
 */
export async function invalidateUserEnrollmentCache(userId: string) {
    if (!redis) return;

    // 1. Invalidate version-agnostic keys
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(userId)),
        invalidateCache(`user:enrolled:${userId}`), // Legacy key used in route.ts
        invalidateCache(`user:enrollment-map:${userId}`),
        // Increment version to rotate all versioned keys
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION),
    ]);
    
    console.log(`[Redis] User Enrollment Cache Invalidated for userId=${userId}`);
}
