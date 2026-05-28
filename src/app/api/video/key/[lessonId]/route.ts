import { prisma } from "@/lib/db";
import { hasCourseContentAccess } from "@/lib/course-access";
import { getCurrentUser } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 1. Fetch lesson and check user access in one query
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        videoEncryptionKey: true,
        Chapter: {
          select: {
            position: true,
            Course: {
              select: {
                isFree: true,
                freeChaptersCount: true,
                enrollment: {
                  where: { userId: user.id },
                  select: { status: true }
                }
              }
            }
          }
        }
      }
    });

    if (!lesson) {
      return new NextResponse("Lesson not found", { status: 404 });
    }

    // 2. Access Check: Admin OR Granted Enrollment
    const enrollment = lesson.Chapter.Course.enrollment[0];
    const hasAccess = hasCourseContentAccess({
      isAdmin: user.role === "admin",
      enrollmentStatus: enrollment?.status,
      isFree: lesson.Chapter.Course.isFree,
      freeChaptersCount: lesson.Chapter.Course.freeChaptersCount,
      chapterPosition: lesson.Chapter.position,
    });

    if (!hasAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!lesson.videoEncryptionKey) {
      return new NextResponse("Video is not encrypted", { status: 404 });
    }

    // 3. Convert stored Base64 key back to 16-byte buffer
    const keyBuffer = Buffer.from(lesson.videoEncryptionKey, 'base64');

    // 4. Return the binary key with CORS headers
    return new NextResponse(keyBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": keyBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600",
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
      }
    });

  } catch (error) {
    console.error("[Video Key API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
