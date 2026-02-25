import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

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
            Course: {
              select: {
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
    const isAdmin = user.role === "admin";
    const enrollment = lesson.Chapter.Course.enrollment[0];
    const hasAccess = isAdmin || (enrollment && enrollment.status === "Granted");

    if (!hasAccess) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!lesson.videoEncryptionKey) {
      return new NextResponse("Video is not encrypted", { status: 404 });
    }

    // 3. Convert stored Base64 key back to 16-byte buffer
    const keyBuffer = Buffer.from(lesson.videoEncryptionKey, 'base64');

    // 4. Return the binary key
    return new NextResponse(keyBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": keyBuffer.length.toString(),
        "Cache-Control": "private, max-age=3600" // Cache for the session to prevent repeated hits
      }
    });

  } catch (error) {
    console.error("[Video Key API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
