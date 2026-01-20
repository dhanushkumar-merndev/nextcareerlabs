import { env } from "@/lib/env";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3 } from "@/lib/S3Client";
import arcjet, { fixedWindow } from "@/lib/arcjet";

import { requireAdmin } from "@/app/data/admin/require-admin";

const fileItemSchema = z.object({
  fileName: z.string().min(1, { message: "File name is required" }),
  contentType: z.string().min(1, { message: "Content type is required" }),
  size: z.number().min(0, { message: "Size is required" }),
  isImage: z.boolean(),
  isKeyDirect: z.boolean().optional(),
  customKey: z.string().optional(),
});

const fileUploadSchema = z.union([fileItemSchema, z.array(fileItemSchema)]);

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 200 }));

export async function POST(request: Request) {
  const session = await requireAdmin();

  try {
    const decision = await aj.protect(request, {
      fingerprint: session?.user.id as string,
    });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const body = await request.json();
    const validation = fileUploadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid Request Body", details: validation.error.format() },
        { status: 400 }
      );
    }

    const items = Array.isArray(validation.data)
      ? validation.data
      : [validation.data];

    const results = await Promise.all(
      items.map(async (item) => {
        const { fileName, contentType, size, isKeyDirect, customKey } = item;
        const key =
          isKeyDirect && customKey ? customKey : `${uuidv4()}-${fileName}`;

        const command = new PutObjectCommand({
          Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
          ContentType: contentType,
          ContentLength: size,
          Key: key,
        });

        const presignedUrl = await getSignedUrl(S3, command, {
          expiresIn: 360, // url expires in 6 mins
        });

        return { presignedUrl, key };
      })
    );

    return NextResponse.json(Array.isArray(validation.data) ? results : results[0]);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
