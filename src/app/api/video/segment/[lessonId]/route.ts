import { env } from "@/lib/env";
import { tigris } from "@/lib/tigris";
import { getAuthorizedVideoAccess } from "@/lib/video-access";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSafeSegmentName(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("file") || "index.ts";
  const fileName = requested.split("?")[0]?.split("/").pop() || "";

  if (!/^[A-Za-z0-9._-]+\.(ts|m3u8)$/.test(fileName)) {
    return null;
  }

  return fileName;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const segmentName = getSafeSegmentName(req);

    if (!segmentName) {
      return new NextResponse("Invalid segment", { status: 400 });
    }

    const auth = await getAuthorizedVideoAccess(
      lessonId,
      req.nextUrl.searchParams.get("v"),
    );

    if (auth.error) return auth.error;

    const object = await tigris.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: `hls/${auth.access!.baseKey}/${segmentName}`,
        Range: req.headers.get("range") ?? undefined,
      }),
    );

    if (!object.Body) {
      return new NextResponse("Segment not found", { status: 404 });
    }

    return new NextResponse(object.Body.transformToWebStream(), {
      status: object.ContentRange ? 206 : 200,
      headers: {
        "Content-Type": object.ContentType || "video/MP2T",
        "Accept-Ranges": "bytes",
        ...(object.ContentLength
          ? { "Content-Length": object.ContentLength.toString() }
          : {}),
        ...(object.ContentRange ? { "Content-Range": object.ContentRange } : {}),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[Video Segment API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
