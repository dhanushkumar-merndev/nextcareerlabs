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
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
            lazyConnect: true
        });

        client.on("error", (err) => {
            if (!err.message.includes("ECONNREFUSED")) {
                console.error("[Redis] Connection Error:", err.message);
            } else {
                console.warn("[Redis] Server unreachable. Falling back to DB.");
            }
        });

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

const OPERATION_TIMEOUT = 1500;

async function withTimeout<T>(promise: Promise<T>, defaultValue: T): Promise<T> {
  const timeoutPromise = new Promise<T>((resolve) =>
    setTimeout(() => resolve(defaultValue), OPERATION_TIMEOUT)
  );
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (e: any) {
    console.error(`[Redis] Operation Timeout/Failure (${e?.message || 'Unknown error'})`);
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
