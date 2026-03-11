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
      enableAutoPipelining: true,
      // Allow a few retries instead of failing immediately forever
      retryStrategy: (times) => {
        if (times > 5) return null; // Stop after 5 attempts
        return Math.min(times * 100, 2000); // 100ms, 200ms, 300ms
      },
      lazyConnect: true,
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
  USER_ENROLLMENTS: (userId: string, version?: string) =>
    version
      ? `user:enrollments:${userId}:${version}`
      : `user:enrollments:${userId}`,
  USER_VERSION: (userId: string) => `user:version:${userId}`,
  ADMIN_TASK_STATUS: "global:admin:task_status",
  ADMIN_DASHBOARD_ALL: "global:admin:dashboard:all",
  ADMIN_DASHBOARD_VERSION: "global:version:admin:dashboard:all",
  AUTH_SESSION_VERSION: "global:version:auth_session",
  COURSE_VERSION: (courseId: string) => `course:version:${courseId}`,
  SLUG_VERSION: (slug: string) => `slug:version:${slug}`,
};

const OPERATION_TIMEOUT = 2000; // Increased for critical version checks

async function withTimeout<T>(
  promise: Promise<T>,
  defaultValue: T,
): Promise<T> {
  // If redis is explicitly in a "closed" or "end" state, don't even try
  if (redis && (redis.status === "end" || redis.status === "close")) {
    // Potentially attempt a manual reconnect if it's dead but still the instance we're using
    try {
      redis.connect().catch(() => {});
    } catch (e) {}
    return defaultValue;
  }

  const timeoutPromise = new Promise<T>((resolve) =>
    setTimeout(() => resolve(defaultValue), OPERATION_TIMEOUT),
  );
  try {
    return await Promise.race([
      promise.catch((err) => {
        // If it's a connection error, log minimally and return defaultValue
        if (err.message.includes("Connection is closed")) {
          return defaultValue;
        }
        throw err;
      }),
      timeoutPromise,
    ]);
  } catch (e: any) {
    if (!e?.message?.includes("Connection is closed")) {
      console.error(
        `[Redis] Operation Timeout/Failure (${e?.message || "Unknown error"})`,
      );
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

export async function getMultiCache<T>(keys: string[]): Promise<(T | null)[]> {
  if (!redis || keys.length === 0) return keys.map(() => null);
  try {
    const rawData = await withTimeout(redis.mget(...keys), null);
    if (!rawData || !Array.isArray(rawData)) return keys.map(() => null);

    return rawData.map((item) => {
      if (!item) return null;
      try {
        return JSON.parse(item) as T;
      } catch {
        return null;
      }
    });
  } catch (error) {
    return keys.map(() => null);
  }
}

/**
 * Optimized version fetcher that avoids JSON.parse for simple strings
 */
export async function getVersions(keys: string[]): Promise<string[]> {
  if (!redis || keys.length === 0) return keys.map(() => "0");
  try {
    const rawData = await withTimeout(redis.mget(...keys), null);
    if (!rawData || !Array.isArray(rawData)) return keys.map(() => "0");

    return rawData.map((item) => {
      if (!item) return "0";
      // Version keys sometimes store double-quoted strings from JSON.stringify
      if (item.startsWith('"') && item.endsWith('"')) {
        return item.slice(1, -1);
      }
      return item;
    });
  } catch (error) {
    return keys.map(() => "0");
  }
}

export async function getGlobalVersion(key: string): Promise<string> {
  if (!redis) return "0";

  // Use redis.get directly to avoid JSON.parse overhead in withTimeout (handled here)
  const version = await withTimeout(redis.get(key), null);

  if (version === null) {
    // 🛡️ DONT generate a new timestamp on every null/timeout!
    // That causes an "Initialization Storm" where one slow request invalidates everyone's cache.
    // We only initialize if we are 100% sure it's intended (e.g. via increment)
    return "0";
  } else {
    // Handle potential double quotes from previous JSON.stringify storage
    const cleanVersion =
      version.startsWith('"') && version.endsWith('"')
        ? version.slice(1, -1)
        : version;
    return cleanVersion;
  }
}

/**
 * Fetches both the global version and the cached data in a single mget call.
 * This saves one round-trip to Redis, which is critical for cold start performance.
 */
export async function getLatestVersionAndCache<T>(
  versionKey: string,
  cacheKey: string,
): Promise<{ version: string; data: T | null }> {
  if (!redis) return { version: "0", data: null };

  try {
    const [version, cachedData] = await withTimeout(
      redis.mget(versionKey, cacheKey),
      [null, null],
    );

    // Initial version if missing
    let cleanVersion = "0";
    if (version === null) {
      cleanVersion = Date.now().toString();
      await setCache(versionKey, cleanVersion, 86400 * 30);
      console.log(`[Redis] Initialized version key="${versionKey}"`);
    } else {
      cleanVersion =
        version.startsWith('"') && version.endsWith('"')
          ? version.slice(1, -1)
          : version;
    }

    let parsedData: T | null = null;
    if (cachedData) {
      try {
        parsedData = JSON.parse(cachedData);
      } catch (e) {
        console.error(`[Redis] Failed to parse cache for key="${cacheKey}"`);
      }
    }

    return { version: cleanVersion, data: parsedData };
  } catch (error) {
    return { version: "0", data: null };
  }
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
    invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`),
    invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
    invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
    invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:chart`),

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
/**
 * Redis-First Progress Tracking (Write-Behind Cache)
 */
export async function setUserPendingProgress(
  userId: string,
  lessonId: string,
  data: {
    lastWatched: number;
    delta: number;
    restrictionTime: number;
    timestamp: number;
  },
) {
  if (!redis) return;
  const key = `user:progress:pending:${userId}`;

  // Get existing pending to accumulate delta
  const existingRaw = await withTimeout(redis.hget(key, lessonId), null);
  let finalData = data;

  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      finalData = {
        ...data,
        delta: existing.delta + data.delta, // Accumulate delta
        restrictionTime: Math.max(
          existing.restrictionTime,
          data.restrictionTime,
        ), // High-water mark
        lastWatched: data.lastWatched, // Latest is always correct
      };
    } catch (e) {}
  }

  await withTimeout(redis.hset(key, lessonId, JSON.stringify(finalData)), null);
  // Set TTL to 1 day to prevent orphan leak
  await withTimeout(redis.expire(key, 86400), null);
}

export async function getUserPendingProgress(userId: string) {
  if (!redis) return {};
  const key = `user:progress:pending:${userId}`;
  const data = await withTimeout(redis.hgetall(key), {});

  const result: Record<string, any> = {};
  for (const [lessonId, val] of Object.entries(data)) {
    try {
      result[lessonId] = JSON.parse(val as string);
    } catch (e) {}
  }
  return result;
}

export async function clearUserPendingProgress(
  userId: string,
  lessonIds: string[],
) {
  if (!redis || lessonIds.length === 0) return;
  const key = `user:progress:pending:${userId}`;
  await withTimeout(redis.hdel(key, ...lessonIds), null);
}

/**
 * [Million-User Scale] Partial Cache Invalidation
 * Increments specific course versions (ID and Slug) to avoid global invalidation storms.
 */
export async function dirtyCourse(courseId: string, slug?: string) {
  if (!redis) return;
  const syncs: Promise<any>[] = [
    incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSE_VERSION(courseId)),
  ];
  if (slug) {
    syncs.push(incrementGlobalVersion(GLOBAL_CACHE_KEYS.SLUG_VERSION(slug)));
  }
  await Promise.all(syncs);
  console.log(`[Redis] Dirtied courseId=${courseId} slug=${slug || "N/A"}`);
}
