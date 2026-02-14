import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { env } from "@/lib/env";
import { S3 } from "@/lib/S3Client";
import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { tigris } from "@/lib/tigris";

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  try {
    const decision = await aj.protect(request, {
      fingerprint: session?.user.id as string,
    });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const body = await request.json();
    const key = decodeURIComponent(body.key);

    if (!key) {
      return NextResponse.json(
        { error: "Invaild Request Body" },
        { status: 400 }
      );
    }

    // 1. Delete the raw file from Tigris
    const command = new DeleteObjectCommand({
      Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
      Key: key,
    });
    try {
      await tigris.send(command);
    } catch (err) {
      // Raw file deletion failed (maybe already deleted)
    }

    // 2. Delete the specific HLS folder for this video from Tigris
    const baseKey = key.replace(/\.[^/.]+$/, "");
    const hlsPrefix = `hls/${baseKey}/`;
    const spritePrefix = `sprites/${baseKey}/`;
    
    console.log(`Deleting assets for baseKey: ${baseKey}`);
    console.log(`HLS Prefix: ${hlsPrefix}`);
    console.log(`Sprite Prefix: ${spritePrefix}`);

    const deleteFolder = async (prefix: string) => {
      try {
        console.log(`Listing objects for prefix: ${prefix}`);
        const listCommand = new ListObjectsV2Command({
          Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
          Prefix: prefix,
        });
        const listedObjects = await tigris.send(listCommand);

        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
          console.log(`Found ${listedObjects.Contents.length} objects to delete for prefix ${prefix}`);
          const deletePromises = listedObjects.Contents.map((obj) =>
            tigris.send(
              new DeleteObjectCommand({
                Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
                Key: obj.Key!,
              })
            )
          );
          await Promise.all(deletePromises);
          console.log(`Successfully deleted all objects for prefix ${prefix}`);
        } else {
          console.log(`No objects found for prefix: ${prefix}`);
        }
      } catch (err) {
        console.error(`Failed to delete folder ${prefix}:`, err);
      }
    };

    await Promise.all([
      deleteFolder(hlsPrefix),
      deleteFolder(spritePrefix)
    ]);

    return NextResponse.json(
      { message: "File deleted successfully" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invaild Request Body" },
      { status: 500 }
    );
  }
}
