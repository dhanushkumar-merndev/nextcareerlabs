"use server";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigris } from "@/lib/tigris";
import { env } from "@/lib/env";

export async function getSignedVideoUrl(key: string) {
  if (!key) return { status: "error", message: "Key is required" };

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
