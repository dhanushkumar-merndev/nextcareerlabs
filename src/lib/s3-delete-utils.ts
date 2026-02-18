import { DeleteObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { tigris } from "./tigris";
import { env } from "./env";

/**
 * Deletes a file and its associated HLS segments (if any) from Tigris/S3.
 */
export async function deleteS3File(key: string) {
  if (!key) return;

  // 1. Delete the raw file from Tigris
  const deleteRawCommand = new DeleteObjectCommand({
    Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
    Key: key,
  });

  try {
    await tigris.send(deleteRawCommand);
  } catch (err) {
    console.error(`Failed to delete raw file ${key}:`, err);
  }

  // 2. Delete the associated folders (HLS and Sprites)
  const baseName = key.replace(/\.[^/.]+$/, "");
  const foldersToCleanup = [
    `hls/${baseName}/`,
    `sprites/${baseName}/`
  ];

  for (const prefix of foldersToCleanup) {
    await deleteFolder(prefix);
  }
}

/**
 * Helper to delete all objects with a certain prefix (folder cleanup)
 */
async function deleteFolder(prefix: string) {
  try {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      
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
        console.log(`[Cleanup] Deleted ${listedObjects.Contents.length} objects with prefix: ${prefix}`);
      }

      isTruncated = listedObjects.IsTruncated ?? false;
      continuationToken = listedObjects.NextContinuationToken;
    }
  } catch (err) {
    console.error(`Failed to delete folder ${prefix}:`, err);
  }
}
