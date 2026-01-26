import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

/**
 * Ensures other sessions are deleted ONCE per login
 */
export async function clearOtherSessionsOnce(
  userId: string,
  sessionId: string
) {
  const key = `session_cleanup:${userId}:${sessionId}`;

  const alreadyDone = await redis?.get(key);
  if (alreadyDone) return;

  await prisma.session.deleteMany({
    where: {
      userId,
      id: { not: sessionId },
    },
  });

  // mark cleanup as done for THIS session
  await redis?.set(key, "1", "EX", 86400); // 24h
}
