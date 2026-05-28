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

function rewritePlaylistSegments(playlist: string, segmentUrl: string) {
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      if (trimmed === "index.ts" || trimmed.endsWith("/index.ts")) {
        return segmentUrl;
      }
      if (trimmed.startsWith("http")) return line;
      return segmentUrl;
    })
    .join("\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
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
      return new NextResponse("Video not found", { status: 404 });
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
      return new NextResponse("Forbidden", { status: 403 });
    }

    const baseKey = getBaseKey(lesson.videoKey);
    const playlistKey = `hls/${baseKey}/master.m3u8`;

    const playlistObject = await tigris.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: playlistKey,
      }),
    );
    const playlist = await playlistObject.Body?.transformToString();

    if (!playlist) {
      return new NextResponse("Playlist not found", { status: 404 });
    }

    const segmentUrl = `${req.nextUrl.origin}/api/video/segment/${lessonId}`;

    return new NextResponse(rewritePlaylistSegments(playlist, segmentUrl), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[Video Playlist API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
