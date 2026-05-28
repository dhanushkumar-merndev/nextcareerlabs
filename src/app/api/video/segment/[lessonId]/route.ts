import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hasCourseContentAccess } from "@/lib/course-access";
import { getCurrentUser } from "@/lib/session";
import { tigris } from "@/lib/tigris";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

function getBaseKey(key: string) {
  if (key.startsWith("hls/")) return key.split("/")[1] ?? "";
  return key.replace(/\.[^/.]+$/, "");
}

async function getAuthorizedSegmentKey(lessonId: string) {
  const user = await getCurrentUser();

  if (!user) {
    return { error: new NextResponse("Unauthorized", { status: 401 }) };
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      videoKey: true,
      Chapter: {
        select: {
          position: true,
          Course: {
            select: {
              isFree: true,
              freeChaptersCount: true,
              enrollment: {
                where: { userId: user.id },
                select: { status: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!lesson?.videoKey) {
    return { error: new NextResponse("Video not found", { status: 404 }) };
  }

  const enrollment = lesson.Chapter.Course.enrollment[0];
  const hasAccess = hasCourseContentAccess({
    isAdmin: user.role === "admin",
    enrollmentStatus: enrollment?.status,
    isFree: lesson.Chapter.Course.isFree,
    freeChaptersCount: lesson.Chapter.Course.freeChaptersCount,
    chapterPosition: lesson.Chapter.position,
  });

  if (!hasAccess) {
    return { error: new NextResponse("Forbidden", { status: 403 }) };
  }

  return { key: `hls/${getBaseKey(lesson.videoKey)}/index.ts` };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const result = await getAuthorizedSegmentKey(lessonId);

    if (result.error) return result.error;

    const object = await tigris.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: result.key,
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
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[Video Segment API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
