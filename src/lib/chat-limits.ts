import { redis } from "./redis";

const DAILY_LIMIT_FREE = 20;
const RATE_LIMIT_PER_MIN = 10;
const DAILY_WINDOW = 86400;
const RATE_WINDOW = 60;

export async function checkChatQuota(
  userId: string,
  isFreeUser: boolean,
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  if (!redis) return { allowed: true, remaining: DAILY_LIMIT_FREE };

  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `chat:daily:${userId}:${today}`;
  const rateKey = `chat:rate:${userId}`;

  if (isFreeUser) {
    const dailyCount = await redis.get(dailyKey);
    const used = dailyCount ? Number(dailyCount) : 0;
    if (used >= DAILY_LIMIT_FREE) {
      return { allowed: false, remaining: 0, reason: "Daily limit reached. Upgrade to paid for unlimited access." };
    }
    await redis.incr(dailyKey);
    await redis.expire(dailyKey, DAILY_WINDOW);
    return { allowed: true, remaining: DAILY_LIMIT_FREE - used - 1 };
  }

  const rl = await checkRateLimit(rateKey, RATE_LIMIT_PER_MIN, RATE_WINDOW);
  if (!rl.success) {
    return { allowed: false, remaining: 0, reason: "Too many requests. Please slow down." };
  }
  return { allowed: true, remaining: rl.remaining };
}

async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ success: boolean; remaining: number }> {
  if (!redis) return { success: true, remaining: limit };

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const clearBefore = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, clearBefore);
    pipeline.zadd(redisKey, now, now.toString());
    pipeline.zcard(redisKey);
    pipeline.expire(redisKey, windowSeconds + 1);

    const results = await pipeline.exec();
    if (!results) return { success: true, remaining: limit };

    const count = results[2]?.[1] as number | undefined;
    const remaining = Math.max(0, limit - (count ?? 0));
    return { success: remaining > 0, remaining };
  } catch {
    return { success: true, remaining: limit };
  }
}
