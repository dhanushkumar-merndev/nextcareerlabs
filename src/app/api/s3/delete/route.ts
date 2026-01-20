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
      console.warn("Raw file deletion failed (maybe already deleted):", err);
    }

    // 2. Delete the specific HLS folder for this video from Tigris
    const hlsPrefix = `hls/${key.replace(/\.[^/.]+$/, "")}/`;
    try {
      // List all objects in the HLS folder
      const listCommand = new ListObjectsV2Command({
        Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
        Prefix: hlsPrefix,
      });
      const listedObjects = await tigris.send(listCommand);

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        // Delete all segments
        const deletePromises = listedObjects.Contents.map((obj) =>
          tigris.send(
            new DeleteObjectCommand({
              Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
              Key: obj.Key!,
            })
          )
        );
        await Promise.all(deletePromises);
        console.log(`Deleted HLS segments for ${key}`);
      }
    } catch (err) {
      console.error("Failed to delete HLS segments:", err);
    }

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
