"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS, CHAT_CACHE_KEYS, incrementChatVersion } from "@/lib/redis";
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
        enrollment: {
          select: {
            userId: true,
          },
        },
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
    const invalidationPromises: Promise<any>[] = [
        invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(course.slug)),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION)
    ];

    // Invalidate Chat Caches for all groups associated with this course
    course.chatGroups.forEach(group => {
        invalidationPromises.push(invalidateCache(CHAT_CACHE_KEYS.MESSAGES(group.id)));
    });

    // 6. Invalidate caches for all ENROLLED users (Students/Admins in the course)
    const enrolledUserIds = new Set(course.enrollment.map((e) => e.userId));
    
    enrolledUserIds.forEach((userId) => {
      invalidationPromises.push(invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(userId)));
      invalidationPromises.push(incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)));
      invalidationPromises.push(invalidateCache(CHAT_CACHE_KEYS.THREADS(userId)));
      invalidationPromises.push(incrementChatVersion(userId));
    });

    // 7. Invalidate chat threads for ALL admins (even if not enrolled) to ensure synchronicity
    const admins = await prisma.user.findMany({
        where: { 
          role: "admin",
          NOT: { id: { in: Array.from(enrolledUserIds) } } // Only admins not already covered
        },
        select: { id: true }
    });

    admins.forEach(admin => {
        invalidationPromises.push(invalidateCache(CHAT_CACHE_KEYS.THREADS(admin.id)));
        invalidationPromises.push(incrementChatVersion(admin.id));
    });

    await Promise.all(invalidationPromises);

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
