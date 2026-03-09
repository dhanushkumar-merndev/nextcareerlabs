"use server";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigris } from "@/lib/tigris";
import { env } from "@/lib/env";
import { requireUser } from "../user/require-user";
import { prisma } from "@/lib/db";

export async function getSignedVideoUrl(key: string) {
  if (!key) return { status: "error", message: "Key is required" };

  const user = await requireUser();

  // Access Control: Verify user is enrolled and key belongs to an accessible lesson
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
      Chapter: {
        Course: {
          enrollment: {
            some: {
              userId: user.id,
              status: "Granted",
            },
          },
        },
      },
    },
  });

  if (!lesson && user.role !== "admin") {
    return {
      status: "error",
      message: "Forbidden: You are not enrolled in this course",
    };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(tigris, command, {
      expiresIn: 60 * 10, // ⏱ 10 minutes
    });

    return { status: "success", url: signedUrl };
  } catch (err: any) {
    console.error(`[S3 Signing Error] Key: ${key}`, err);
    return { status: "error", message: err.message || "Failed to sign URL" };
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
        Chapter: {
          Course: {
            enrollment: {
              some: {
                userId: user.id,
                status: "Granted",
              },
            },
          },
        },
      },
      select: { videoKey: true, transcription: { select: { vttUrl: true } } },
    });

    // Map back to authorized keys
    authorizedLessons.forEach((l) => {
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
  } catch (err: any) {
    console.error(`[S3 Batch Signing Error]`, err);
    return { status: "error", message: err.message || "Failed to sign URLs" };
  }
}
