"use server";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigris } from "@/lib/tigris";
import { env } from "@/lib/env";

export async function getSignedVideoUrl(key: string) {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES!,
    Key: key,
  });

  const signedUrl = await getSignedUrl(tigris, command, {
    expiresIn: 60 * 10, // ⏱ 10 minutes
  });

  return signedUrl;
}
