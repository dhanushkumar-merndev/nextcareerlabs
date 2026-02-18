import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env';

/**
 * Upload WebVTT content to S3
 * @param lessonId - Lesson ID for folder structure
 * @param vttContent - WebVTT content as string
 * @returns Object with S3 key and public URL
 */
export async function uploadTranscriptionToS3(
  lessonId: string,
  vttContent: string,
  customKey?: string
): Promise<{  key: string;
  url: string;
}> {
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT_URL_S3,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // S3 key: if customKey provided (grouped with HLS), use it. Otherwise fallback to old structure.
  const key = customKey || `transcriptions/${lessonId}/caption.vtt`;
  console.log(`[S3 Upload] Uploading transcription for lesson ${lessonId} to key: ${key}`);

  // Upload to S3-compatible storage (Tigris Data)
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: vttContent,
    ContentType: 'text/vtt',
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
  });

  await s3Client.send(command);

  // Construct public URL for Tigris Data (using the same format as Uploader.tsx)
  const url = `https://${env.S3_BUCKET_NAME}.t3.storage.dev/${key}`;

  return { key, url };
}

/**
 * Upload sprite images to S3 alongside transcriptions
 */
export async function uploadSpriteToS3(
  lessonId: string,
  spriteBlob: Blob,
  filename: string
): Promise<{
  key: string;
  url: string;
}> {
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT_URL_S3,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // S3 key: transcriptions/{lessonId}/sprites/{filename}
  const key = `transcriptions/${lessonId}/sprites/${filename}`;

  const buffer = await spriteBlob.arrayBuffer();

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    Body: Buffer.from(buffer),
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000',
  });

  await s3Client.send(command);

  const url = `${env.AWS_ENDPOINT_URL_S3}/${env.S3_BUCKET_NAME}/${key}`;

  return { key, url };
}
