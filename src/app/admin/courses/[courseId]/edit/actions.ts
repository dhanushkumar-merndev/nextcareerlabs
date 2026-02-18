"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import {
  chapterSchema,
  ChapterSchemaType,
  courseSchema,
  CourseSchemaType,
  lessonSchema,
  LessonSchemaType,
} from "@/lib/zodSchemas";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

export async function editCourse(
  data: CourseSchemaType,
  courseId: string
): Promise<ApiResponse> {
  const user = await requireAdmin();
  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: user.user.id,
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

    const result = courseSchema.safeParse(data);
    if (!result.success) {
      return {
        status: "error",
        message: "Invaild data",
      };
    }

    await prisma.course.update({
      where: {
        id: courseId,
        userId: user.user.id,
      },
      data: {
        ...result.data,
      },
    });

    // Auto-create Broadcast Group if Published
    if (result.data.status === "Published") {
        const existingGroup = await prisma.chatGroup.findFirst({
            where: { courseId: courseId }
        });

        if (!existingGroup) {
            await prisma.chatGroup.create({
                data: {
                    name: `${result.data.title} Group`,
                    courseId: courseId,
                    imageUrl: result.data.fileKey 
                }
            });
        }
    }

    // Invalidate global courses and analytics cache
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(result.data.slug)),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION)
    ]);

    return {
      status: "success",
      message: "Course updated successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Faild to update course",
    };
  }
}

export async function reorderLessons(
  chapterId: string,
  lesson: { id: string; position: number }[],
  courseId: string
): Promise<ApiResponse> {
  try {
    if (!lesson || lesson.length === 0) {
      return {
        status: "error",
        message: "No lesson provided for reordering",
      };
    }
    const updates = lesson.map((lesson) => {
      return prisma.lesson.update({
        where: {
          id: lesson.id,
          chapterId: chapterId,
        },
        data: {
          position: lesson.position,
        },
      });
    });
    await prisma.$transaction(updates);
    
    // Invalidate caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);
    return {
      status: "success",
      message: "Lessons reordered successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Faild to reorder lessons",
    };
  }
}

export async function reorderChapters(
  courseId: string,
  chapters: { id: string; position: number }[]
): Promise<ApiResponse> {
  await requireAdmin();
  try {
    if (!chapters || chapters.length === 0) {
      return {
        status: "error",
        message: "No chapters provided for reordering",
      };
    }
    const updates = chapters.map((chapter) => {
      return prisma.chapter.update({
        where: {
          id: chapter.id,
          courseId: courseId,
        },
        data: {
          position: chapter.position,
        },
      });
    });
    await prisma.$transaction(updates);
    
    // Invalidate caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);
    return {
      status: "success",
      message: "Chapters reordered successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Faild to reorder chapters",
    };
  }
}

export async function createChapter(
  data: ChapterSchemaType
): Promise<ApiResponse> {
  await requireAdmin();
  try {
    const result = chapterSchema.safeParse(data);
    if (!result.success) {
      return {
        status: "error",
        message: "Invaild data",
      };
    }
    await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.chapter.findFirst({
        where: {
          courseId: result.data.courseId,
        },
        select: {
          position: true,
        },
        orderBy: {
          position: "desc",
        },
      });
      await tx.chapter.create({
        data: {
          title: result.data.name,
          courseId: result.data.courseId,
          position: (maxPosition?.position ?? 0) + 1,
        },
      });
    });

    // Invalidate analytics and dashboard caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${result.data.courseId}/edit`);
    return {
      status: "success",
      message: "Chapter created successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to create chapter",
    };
  }
}

export async function createLesson(
  data: LessonSchemaType
): Promise<ApiResponse> {
  await requireAdmin();
  try {
    const result = lessonSchema.safeParse(data);
    if (!result.success) {
      return {
        status: "error",
        message: "Invaild data",
      };
    }
    await prisma.$transaction(async (tx) => {
      const maxPosition = await tx.lesson.findFirst({
        where: {
          chapterId: result.data.chapterId,
        },
        select: {
          position: true,
        },
        orderBy: {
          position: "desc",
        },
      });
      await tx.lesson.create({
        data: {
          title: result.data.name,
          description: result.data.description,
          videoKey: result.data.videoKey,
          thumbnailKey: result.data.thumbnailKey,
          chapterId: result.data.chapterId,
          position: (maxPosition?.position ?? 0) + 1,
        },
      });
    });

    // Invalidate analytics and dashboard caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${result.data.courseId}/edit`);
    return {
      status: "success",
      message: "Lesson created successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to create lesson",
    };
  }
}

export async function deleteLesson({
  chapterId,
  courseId,
  lessonId,
}: {
  chapterId: string;
  courseId: string;
  lessonId: string;
}): Promise<ApiResponse> {
  await requireAdmin();
  try {
    const chapterWithLessons = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
      },
      select: {
        lesson: {
          orderBy: {
            position: "asc",
          },
          select: {
            id: true,
            position: true,
          },
        },
      },
    });

    if (!chapterWithLessons) {
      return {
        status: "error",
        message: "Chapter not found",
      };
    }

    const lessons = chapterWithLessons.lesson;
    const lessonToDelete = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, videoKey: true, thumbnailKey: true },
    });

    if (!lessonToDelete) {
      return {
        status: "error",
        message: "Lesson not found",
      };
    }

    // cleanup files
    const { deleteS3File } = await import("@/lib/s3-delete-utils");
    if (lessonToDelete.videoKey) await deleteS3File(lessonToDelete.videoKey);
    if (lessonToDelete.thumbnailKey)
      await deleteS3File(lessonToDelete.thumbnailKey);

    const remainingLessons = lessons.filter((lesson) => lesson.id !== lessonId);
    const updates = remainingLessons.map((lesson, index) => {
      return prisma.lesson.update({
        where: {
          id: lesson.id,
        },
        data: {
          position: index + 1,
        },
      });
    });

    await prisma.$transaction([
      ...updates,
      prisma.lesson.delete({ where: { id: lessonId, chapterId: chapterId } }),
    ]);

    // Invalidate analytics and dashboard caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        invalidateCache(`lesson:${lessonId}`),
        invalidateCache(`lesson:questions:${lessonId}`),
        invalidateCache(`lesson:content:${lessonId}`),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);
    return {
      status: "success",
      message: "Lesson deleted successfully",
    };
  } catch (error) {
    console.error("Delete lesson error:", error);
    return {
      status: "error",
      message: "Failed to delete lesson",
    };
  }
}
export async function deleteChapter({
  chapterId,
  courseId,
}: {
  chapterId: string;
  courseId: string;
}): Promise<ApiResponse> {
  await requireAdmin();

  try {
    const courseWithChapters = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        chapter: {
          orderBy: { position: "asc" },
          select: { id: true, position: true },
        },
      },
    });

    if (!courseWithChapters) {
      return { status: "error", message: "Course not found" };
    }

    const chapterToDelete = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        lesson: {
          select: { videoKey: true, thumbnailKey: true },
        },
      },
    });

    if (!chapterToDelete) {
      return { status: "error", message: "Chapter not found" };
    }

    // Collect and delete files
    const keysToDelete = new Set<string>();
    chapterToDelete.lesson.forEach((lesson) => {
      if (lesson.videoKey) keysToDelete.add(lesson.videoKey);
      if (lesson.thumbnailKey) keysToDelete.add(lesson.thumbnailKey);
    });

    const { deleteS3File } = await import("@/lib/s3-delete-utils");
    await Promise.all(Array.from(keysToDelete).map((key) => deleteS3File(key)));

    const remainingChapters = courseWithChapters.chapter.filter(
      (c) => c.id !== chapterId
    );

    const updates = remainingChapters.map((chapter, index) =>
      prisma.chapter.update({
        where: { id: chapter.id },
        data: { position: index + 1 },
      })
    );

    await prisma.$transaction([
      ...updates,
      prisma.chapter.delete({
        where: { id: chapterId },
      }),
    ]);

    // Invalidate analytics and dashboard caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return {
      status: "success",
      message: "Chapter deleted successfully",
    };
  } catch (error) {
    console.error("Delete chapter error:", error);
    return {
      status: "error",
      message: "Failed to delete chapter",
    };
  }
}
export async function editChapter({
  chapterId,
  courseId,
  name,
}: {
  chapterId: string;
  courseId: string;
  name: string;
}): Promise<ApiResponse> {
  await requireAdmin();

  try {
    if (!name || name.trim().length === 0) {
      return {
        status: "error",
        message: "Chapter name cannot be empty",
      };
    }

    await prisma.chapter.update({
      where: {
        id: chapterId,
        courseId,
      },
      data: {
        title: name.trim(),
      },
    });

    // Invalidate analytics and dashboard caches
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION)
    ]);

    // Revalidate the edit page
    revalidatePath(`/admin/courses/${courseId}/edit`);

    return {
      status: "success",
      message: "Chapter updated successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to update chapter",
    };
  }
}
