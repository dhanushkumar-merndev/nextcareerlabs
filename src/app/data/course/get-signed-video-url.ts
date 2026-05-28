
"use server";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigris } from "@/lib/tigris";
import { env } from "@/lib/env";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";
import { hasCourseContentAccess } from "@/lib/course-access";

export async function getSignedVideoUrl(key: string) {
  if (!key) return { status: "error", message: "Key is required" };

  const t0 = Date.now();
  const user = await requireUser();

  // Access Control: Verify user has granted access or the key belongs to a demo lesson
  const baseKey = key.startsWith("hls/")
    ? key.split("/")[1]
    : key.replace(/\.[^/.]+$/, "");

  const lesson = await prisma.lesson.findFirst({
    where: {
      OR: [
        { videoKey: key },
        { videoKey: { contains: baseKey } },
        { transcription: { vttUrl: key } },
      ],
    },
    select: {
      Chapter: {
        select: {
          position: true,
          Course: {
            select: {
              isFree: true,
              freeChaptersCount: true,
              enrollment: {
                where: { userId: user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  const canAccess = lesson
    ? hasCourseContentAccess({
        isAdmin: user.role === "admin",
        enrollmentStatus: lesson.Chapter.Course.enrollment[0]?.status,
        isFree: lesson.Chapter.Course.isFree,
        freeChaptersCount: lesson.Chapter.Course.freeChaptersCount,
        chapterPosition: lesson.Chapter.position,
      })
    : user.role === "admin";

  if (!canAccess) {
    return {
      status: "error",
      message: "Forbidden: Request access to unlock this lesson",
    };
  }

  try {
    const s3Start = Date.now();
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(tigris, command, {
      expiresIn: 60 * 10, // ⏱ 10 minutes
    });

    if (process.env.NODE_ENV === "development") {
      console.log(`[getSignedVideoUrl] Total: ${Date.now() - t0}ms, S3 signing: ${Date.now() - s3Start}ms`);
    }
    return { status: "success", url: signedUrl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to sign URL";
    console.error(`[S3 Signing Error] Key: ${key}`, err);
    return { status: "error", message };
  }
}

export async function getBatchSignedVideoUrls(keys: string[]) {
  if (!keys || keys.length === 0) return { status: "success", urls: {} };

  const user = await requireUser();

  // Access Control: Filter keys the user is authorized for
  const authorizedKeys: string[] = [];

  if (user.role === "admin") {
    authorizedKeys.push(...keys);
  } else {
    // Extract base keys
    const baseKeys = keys.map((k) =>
      k.startsWith("hls/") ? k.split("/")[1] : k.replace(/\.[^/.]+$/, ""),
    );

    const authorizedLessons = await prisma.lesson.findMany({
      where: {
        OR: [
          { videoKey: { in: keys } },
          { videoKey: { contains: baseKeys[0] } }, // simplified check for batch
          { transcription: { vttUrl: { in: keys } } },
        ],
      },
      select: {
        videoKey: true,
        transcription: { select: { vttUrl: true } },
        Chapter: {
          select: {
            position: true,
            Course: {
              select: {
                isFree: true,
                freeChaptersCount: true,
                enrollment: {
                  where: { userId: user.id },
                  select: { status: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Map back to authorized keys
    authorizedLessons.forEach((l) => {
      const canAccess = hasCourseContentAccess({
        enrollmentStatus: l.Chapter.Course.enrollment[0]?.status,
        isFree: l.Chapter.Course.isFree,
        freeChaptersCount: l.Chapter.Course.freeChaptersCount,
        chapterPosition: l.Chapter.position,
      });
      if (!canAccess) return;

      if (l.videoKey) {
        const base = l.videoKey.startsWith("hls/")
          ? l.videoKey.split("/")[1]
          : l.videoKey.replace(/\.[^/.]+$/, "");
        keys.forEach((k) => {
          if (k.includes(base) || k === l.transcription?.vttUrl) {
            authorizedKeys.push(k);
          }
        });
      }
    });
  }

  const keysToProcess = [...new Set(authorizedKeys)];

  try {
    const results: Record<string, string> = {};

    // Sign all authorized URLs in parallel
    await Promise.all(
      keysToProcess.map(async (key) => {
        if (!key) return;
        const command = new GetObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: key,
        });
        const signedUrl = await getSignedUrl(tigris, command, {
          expiresIn: 60 * 10,
        });
        results[key] = signedUrl;
      }),
    );

    return { status: "success", urls: results };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to sign URLs";
    console.error(`[S3 Batch Signing Error]`, err);
    return { status: "error", message };
  }
}
