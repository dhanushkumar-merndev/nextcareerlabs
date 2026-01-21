import { DeleteObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { tigris } from "./tigris";
import { env } from "./env";

/**
 * Deletes a file and its associated HLS segments (if any) from Tigris/S3.
 */
export async function deleteS3File(key: string) {
  if (!key) return;

  // 1. Delete the raw file from Tigris
  const command = new DeleteObjectCommand({
    Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
    Key: key,
  });

  try {
    await tigris.send(command);
  } catch (err) {
    console.error(`Failed to delete raw file ${key}:`, err);
  }

  // 2. Delete the specific HLS folder for this video from Tigris
  const hlsPrefix = `hls/${key.replace(/\.[^/.]+$/, "")}/`;
  
  try {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
        Prefix: hlsPrefix,
        ContinuationToken: continuationToken,
      });
      
      // Explicitly cast or let TS infer from properly typed client. 
      // Sometimes in loops TS gets confused.
      const listedObjects: ListObjectsV2CommandOutput = await tigris.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        const deletePromises = listedObjects.Contents.map((obj) =>
          tigris.send(
            new DeleteObjectCommand({
              Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
              Key: obj.Key!,
            })
          )
        );
        await Promise.all(deletePromises);
      }

      isTruncated = listedObjects.IsTruncated ?? false;
      continuationToken = listedObjects.NextContinuationToken;
    }
  } catch (err) {
    console.error(`Failed to delete HLS segments for ${key}:`, err);
  }
}
