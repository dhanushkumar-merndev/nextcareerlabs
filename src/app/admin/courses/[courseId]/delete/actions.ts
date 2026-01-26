"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";
const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

export async function deleteCourse(courseId: string): Promise<ApiResponse> {
  const session = await requireAdmin();
  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return {
          status: "error",
          message: "you have been blocked due to too many requests",
        };
      } else {
        return {
          status: "error",
          message: "you are a bot! if this is a mistake contact out support",
        };
      }
    }
    // 1. Fetch course details to get file keys and ChatGroup
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        chapter: {
          include: {
            lesson: true,
          },
        },
        chatGroups: true,
      },
    });

    if (!course) {
      return {
        status: "error",
        message: "Course not found",
      };
    }

    // 2. Collect all S3 keys to delete
    const keysToDelete = new Set<string>();
    
    // Course thumbnail
    if (course.fileKey) keysToDelete.add(course.fileKey);

    // Lesson videos and thumbnails
    course.chapter.forEach((chapter) => {
      chapter.lesson.forEach((lesson) => {
        if (lesson.videoKey) keysToDelete.add(lesson.videoKey);
        if (lesson.thumbnailKey) keysToDelete.add(lesson.thumbnailKey);
      });
    });

    // 3. Delete files from S3
    const { deleteS3File } = await import("@/lib/s3-delete-utils");
    await Promise.all(Array.from(keysToDelete).map((key) => deleteS3File(key)));

    // 4. Delete ChatGroup if exists
    if (course.chatGroups.length > 0) {
      await prisma.chatGroup.deleteMany({
        where: { courseId: courseId },
      });
    }

    // 5. Delete the course (cascades to Chapter, Lesson, etc. thanks to schema)
    await prisma.course.delete({
      where: {
        id: courseId,
      },
    });

    revalidatePath("/admin/courses");
    revalidatePath("/admin/resources"); // Revalidate Resources page since ChatGroup is gone

    // Invalidate global courses and analytics cache
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(course.slug)),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION)
    ]);

    return {
      status: "success",
      message: "Course Deleted Successfully",
    };
  } catch (error) {
    console.error("Delete course error:", error);
    return {
      status: "error",
      message: "Failed to delete course!",
    };
  }
}
