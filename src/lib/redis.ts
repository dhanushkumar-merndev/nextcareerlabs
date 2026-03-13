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
  ARCHIVE_STATUS: (userId: string) => `chat:archive_status:${userId}`,
  ARCHIVE_DIRTY: (userId: string) => `chat:archive_dirty:${userId}`,
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
 * ⚡ [Redis-First Archive]
 * Stores the toggle state in Redis instantly. DB sync will happen later.
 */
export async function setBufferedArchiveStatus(
  userId: string,
  threadId: string,
  isArchived: boolean,
) {
  if (!redis) return;
  const statusKey = CHAT_CACHE_KEYS.ARCHIVE_STATUS(userId);
  const dirtyKey = CHAT_CACHE_KEYS.ARCHIVE_DIRTY(userId);

  const pipeline = redis.pipeline();
  pipeline.hset(statusKey, threadId, isArchived ? "1" : "0");
  // Store the timestamp of the last toggle
  pipeline.hset(dirtyKey, threadId, Date.now().toString());
  pipeline.expire(statusKey, 86400 * 7); 
  pipeline.expire(dirtyKey, 86400 * 7);

  await withTimeout(pipeline.exec(), null);
}

export async function getBufferedArchiveStatus(userId: string) {
  if (!redis) return {};
  const data = await withTimeout(
    redis.hgetall(CHAT_CACHE_KEYS.ARCHIVE_STATUS(userId)),
    {},
  );
  const result: Record<string, boolean> = {};
  for (const [tid, val] of Object.entries(data)) {
    result[tid] = val === "1";
  }
  return result;
}

export async function getDirtyArchiveThreads(userId: string) {
  if (!redis) return {};
  const data = await withTimeout(
    redis.hgetall(CHAT_CACHE_KEYS.ARCHIVE_DIRTY(userId)),
    {},
  );
  const result: Record<string, number> = {};
  for (const [tid, val] of Object.entries(data)) {
    result[tid] = parseInt(val as string);
  }
  return result;
}

export async function clearDirtyArchiveThreads(
  userId: string,
  threadIds: string[],
) {
  if (!redis || threadIds.length === 0) return;
  await withTimeout(
    redis.hdel(CHAT_CACHE_KEYS.ARCHIVE_DIRTY(userId), ...threadIds),
    null,
  );
}

/**
 * [Million-User Scale] Partial Cache Invalidation
 */
export async function dirtyCourse(courseId: string, slug?: string) {
  if (!redis) return;
  const pipeline = redis.pipeline();
  pipeline.set(
    GLOBAL_CACHE_KEYS.COURSE_VERSION(courseId),
    JSON.stringify(Date.now().toString()),
    "EX",
    86400 * 7,
  );
  if (slug) {
    pipeline.set(
      GLOBAL_CACHE_KEYS.SLUG_VERSION(slug),
      JSON.stringify(Date.now().toString()),
      "EX",
      86400 * 7,
    );
  }
  await withTimeout(pipeline.exec(), null);
  console.log(`[Redis] Dirtied courseId=${courseId} slug=${slug || "N/A"}`);
}

/**
 * 🛡️ PRODUCTION: Redis-Based Rate Limiting (Sliding Window)
 * Prevents abuse and protects backend resources.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!redis) return { success: true, limit, remaining: limit, reset: 0 };

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const clearBefore = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, clearBefore); // Remove old entries
    pipeline.zadd(redisKey, now, now.toString()); // Add current attempt
    pipeline.zcard(redisKey); // Count recent attempts
    pipeline.expire(redisKey, windowSeconds + 1); // Set TTL slightly above window

    const results = await withTimeout(pipeline.exec(), null);
    if (!results) return { success: true, limit, remaining: limit, reset: 0 };

    // results structure: [[err, res], [err, res], ...]
    const count = (results[2][1] as number) || 0;
    const remaining = Math.max(0, limit - count);

    // Get the oldest timestamp in the window to calculate reset time
    const oldestResult = await redis.zrange(redisKey, 0, 0, "WITHSCORES");
    const oldestTimestamp = oldestResult.length > 0 ? parseInt(oldestResult[1]) : now;
    const reset = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    if (count > limit) {
      return { success: false, limit, remaining, reset };
    }

    return { success: true, limit, remaining, reset };
  } catch (error) {
    console.warn(`[Redis] Rate limit check failed for ${key}:`, error);
    return { success: true, limit, remaining: limit, reset: 0 }; // Fail open
  }
}

/**
 * 🔒 PRODUCTION: Distributed-Lock to prevent Thundering Herd
 */
export async function withDistributedLock<T>(
  lockKey: string,
  task: () => Promise<T>,
  ttlSeconds: number = 10,
): Promise<T | null> {
  if (!redis) return await task();

  const fullKey = `lock:${lockKey}`;
  const lockValue = Date.now().toString();

  // NX: Only set if not exists, EX: Set expiry
  const acquired = await redis.set(fullKey, lockValue, "EX", ttlSeconds, "NX");

  if (acquired !== "OK") {
    // Lock failed, another process is working on it
    return null;
  }

  try {
    return await task();
  } finally {
    // Release lock ONLY if it's still ours (using Lua script for atomicity)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, fullKey, lockValue);
  }
}

/**
 * 🚀 PRODUCTION: Cache-Stampede Prevention (Stale-while-revalidate)
 */
export async function getOrSetWithStampedePrevention<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 1800,
): Promise<T> {
  if (!redis) return await fetcher();

  const cached = await getCache<{ data: T; expiresAt: number }>(key);
  const now = Date.now();

  if (cached) {
    // If it's near expiration (e.g., within 10% of TTL or 60s), revalidate in background
    const threshold = Math.min(60, ttlSeconds * 0.1) * 1000;
    if (now > cached.expiresAt - threshold) {
      // Background revalidation
      withDistributedLock(`revalidate:${key}`, async () => {
        const newData = await fetcher();
        await setCache(key, { data: newData, expiresAt: Date.now() + ttlSeconds * 1000 }, ttlSeconds + 60);
      }).catch(() => {}); // Non-blocking
    }
    return cached.data;
  }

  // Cold cache, use lock to ensure only one fetcher runs
  let result = await withDistributedLock(`fetch:${key}`, async () => {
    const data = await fetcher();
    await setCache(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 }, ttlSeconds + 60);
    return data;
  });

  // If another process got the lock, wait a bit and check cache again
  if (result === null) {
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 100));
      const retryCached = await getCache<{ data: T }>(key);
      if (retryCached) return retryCached.data;
    }
    // Fallback to direct fetch if still null
    return await fetcher();
  }

  return result;
}

/**
 * 🛡️ PRODUCTION: Debounced Global Version Increment
 * Prevents "Version Storms" where high frequency actions (like lesson progress heartbeats) 
 * would constantly invalidate thousands of admin sessions at once.
 */
export async function incrementGlobalVersionDebounced(key: string, windowSeconds: number = 60) {
  if (!redis) return;

  const lockKey = `debounce:version:${key}`;
  const now = Date.now();

  // We use a distributed lock as a debounce flag
  const acquired = await redis.set(lockKey, "1", "EX", windowSeconds, "NX");
  
  if (acquired === "OK") {
    // Only increment if we won the debounce slot
    const nextVersion = now.toString();
    await setCache(key, nextVersion, 86400 * 7);
    console.log(`[Redis] Debounced Increment for version key="${key}" (Next in ${windowSeconds}s)`);
  }
}

/**
 * ⚡ PRODUCTION: High-Frequency Security Cache
 * Used to wrap database lookups that happen on every request (e.g., Enrollment status checks).
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> {
  if (!redis) return await fetcher();

  const cached = await getCache<T>(key);
  if (cached !== null) return cached;

  // Cache miss: use lock to prevent thundering herd on DB
  const result = await withDistributedLock(`fetch:security:${key}`, async () => {
    const data = await fetcher();
    if (data !== null) {
      await setCache(key, data, ttlSeconds);
    }
    return data;
  });

  if (result === null) {
    // Another process is fetching, wait a bit or fallback
    await new Promise(r => setTimeout(r, 100));
    const retry = await getCache<T>(key);
    return retry !== null ? retry : await fetcher();
  }

  return result;
}
