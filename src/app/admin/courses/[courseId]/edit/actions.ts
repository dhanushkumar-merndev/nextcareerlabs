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
import { z } from "zod";
import {
  invalidateCache,
  incrementGlobalVersion,
  GLOBAL_CACHE_KEYS,
  dirtyCourse,
} from "@/lib/redis";
import { invalidateAdminsCache } from "@/app/data/notifications/actions";
import { adminGetCourse } from "@/app/data/admin/admin-get-course";

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

const importLessonSchema = z.object({
  title: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const importChapterSchema = z.object({
  title: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  lessons: z.array(importLessonSchema).default([]),
});

const importCourseStructureSchema = z.union([
  z.object({
    chapters: z.array(importChapterSchema).min(1),
  }),
  z.array(importChapterSchema).min(1),
]);

function textToRichTextJson(value: string | null) {
  if (!value) return null;

  type TextNode = {
    type: "text";
    text: string;
    marks?: { type: "bold" | "italic" | "code" }[];
  };

  function parseInlineMarkdown(text: string): TextNode[] {
    const nodes: TextNode[] = [];
    const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
      }

      if (match[2]) {
        nodes.push({
          type: "text",
          text: match[2],
          marks: [{ type: "bold" }],
        });
      } else if (match[3]) {
        nodes.push({
          type: "text",
          text: match[3],
          marks: [{ type: "italic" }],
        });
      } else if (match[4]) {
        nodes.push({
          type: "text",
          text: match[4],
          marks: [{ type: "code" }],
        });
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push({ type: "text", text: text.slice(lastIndex) });
    }

    return nodes.length ? nodes : [{ type: "text", text }];
  }

  function getAlignment(line: string) {
    const alignment = line.match(/^\[(center|right|left)\](.+)\[\/\1\]$/i);

    if (!alignment) {
      return { textAlign: undefined, text: line };
    }

    return {
      textAlign: alignment[1].toLowerCase(),
      text: alignment[2].trim(),
    };
  }

  const content: unknown[] = [];
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let listType: "bulletList" | "orderedList" | null = null;
  let listItems: unknown[] = [];

  function closeParagraph() {
    if (!paragraph.length) return;

    const { text, textAlign } = getAlignment(paragraph.join(" ").trim());
    content.push({
      type: "paragraph",
      attrs: textAlign ? { textAlign } : undefined,
      content: parseInlineMarkdown(text),
    });
    paragraph = [];
  }

  function closeList() {
    if (!listType) return;

    content.push({
      type: listType,
      content: listItems,
    });
    listType = null;
    listItems = [];
  }

  function addListItem(type: "bulletList" | "orderedList", text: string) {
    closeParagraph();

    if (listType !== type) {
      closeList();
      listType = type;
    }

    listItems.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: parseInlineMarkdown(text),
        },
      ],
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const { text, textAlign } = getAlignment(heading[2].trim());
      content.push({
        type: "heading",
        attrs: {
          level: heading[1].length,
          ...(textAlign ? { textAlign } : {}),
        },
        content: parseInlineMarkdown(text),
      });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      addListItem("bulletList", bullet[1].trim());
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      addListItem("orderedList", ordered[1].trim());
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  closeParagraph();
  closeList();

  return JSON.stringify({
    type: "doc",
    content,
  });
}

export async function editCourse(
  data: CourseSchemaType,
  courseId: string,
): Promise<ApiResponse> {
  console.log(`[AdminCourseAction] Editing course ${courseId}: ${data.title}`);
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
        message: result.error.issues[0]?.message ?? "Invalid data",
      };
    }

    const updateStartTime = Date.now();
    await prisma.course.update({
      where: {
        id: courseId,
        // userId: user.user.id, // Removed to allow any authorized admin
      },
      data: {
        ...result.data,
        fileKey: result.data.fileKey ?? "",
      },
    });
    console.log(
      `[editCourse] DB Update took ${Date.now() - updateStartTime}ms`,
    );

    // Sync or Auto-create Chat Group
    const existingGroup = await prisma.chatGroup.findFirst({
      where: { courseId: courseId },
    });

    if (existingGroup) {
      await prisma.chatGroup.update({
        where: { id: existingGroup.id },
        data: {
          name: `${result.data.title} Group`,
          imageUrl: result.data.fileKey,
        },
      });
    } else if (result.data.status === "Published") {
      await prisma.chatGroup.create({
        data: {
          name: `${result.data.title} Group`,
          courseId: courseId,
          imageUrl: result.data.fileKey,
        },
      });
    }

    // Invalidate global courses and analytics cache
    console.log(
      `[editCourse] Invalidating extensive caches for CourseId=${courseId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(result.data.slug)),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      await dirtyCourse(courseId, result.data.slug),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
      invalidateAdminsCache(),
    ]);
    console.log(
      `[editCourse] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

    revalidatePath("/courses");
    revalidatePath(`/courses/${result.data.slug}`);
    revalidatePath("/admin/resources");

    return {
      status: "success",
      message: "Course updated successfully",
    };
  } catch (error) {
    console.error("[editCourse] Error:", error);
    return {
      status: "error",
      message: "Failed to update course",
    };
  }
}

export async function reorderLessons(
  chapterId: string,
  lesson: { id: string; position: number }[],
  courseId: string,
): Promise<ApiResponse> {
  try {
    if (!lesson || lesson.length === 0) {
      return {
        status: "error",
        message: "No lesson provided for reordering",
      };
    }
    // 🛡️ Verify chapter belongs to course
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, courseId: courseId },
      select: { id: true },
    });
    if (!chapter) {
      return { status: "error", message: "Chapter not found in this course" };
    }

    const updates = lesson.map((item) => {
      return prisma.lesson.update({
        where: {
          id: item.id,
          chapterId: chapterId, // Verify lesson belongs to this chapter
        },
        data: {
          position: item.position,
        },
      });
    });
    const startTime = Date.now();
    await prisma.$transaction(updates);
    console.log(
      `[reorderLessons] Transaction took ${Date.now() - startTime}ms`,
    );

    // Invalidate caches
    console.log(
      `[reorderLessons] Invalidating caches for CourseId=${courseId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      await dirtyCourse(courseId),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);
    console.log(
      `[reorderLessons] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

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
  chapters: { id: string; position: number }[],
): Promise<ApiResponse> {
  console.log(`[AdminCourseAction] Reordering chapters in course ${courseId}`);
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
          courseId: courseId, // 🛡️ Scoping verified here
        },
        data: {
          position: chapter.position,
        },
      });
    });
    const startTime = Date.now();
    await prisma.$transaction(updates);
    console.log(
      `[reorderChapters] Transaction took ${Date.now() - startTime}ms`,
    );

    // Invalidate caches
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSE_VERSION(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);
    return {
      status: "success",
      message: "Chapters reordered successfully",
    };
  } catch (error) {
    console.error("[reorderChapters] Error:", error);
    return {
      status: "error",
      message: "Failed to reorder chapters",
    };
  }
}

export async function createChapter(
  data: ChapterSchemaType,
): Promise<ApiResponse> {
  console.log(
    `[AdminCourseAction] Creating chapter: ${data.name} (Course: ${data.courseId})`,
  );
  await requireAdmin();
  try {
    const result = chapterSchema.safeParse(data);
    if (!result.success) {
      return {
        status: "error",
        message: result.error.issues[0]?.message ?? "Invalid data",
      };
    }
    const startTime = Date.now();
    await prisma.$transaction(async (tx) => {
      // 🛡️ Verify chapter belongs to course
      const course = await tx.course.findUnique({
        where: { id: result.data.courseId },
        select: { id: true },
      });
      if (!course) throw new Error("Course not found");

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
    console.log(`[createChapter] Transaction took ${Date.now() - startTime}ms`);

    // Invalidate analytics and dashboard caches
    console.log(
      `[createChapter] Invalidating caches for CourseId=${result.data.courseId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(
        GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(result.data.courseId),
      ),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
      await dirtyCourse(result.data.courseId),
    ]);
    console.log(
      `[createChapter] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

    revalidatePath(`/admin/courses/${result.data.courseId}/edit`);
    revalidatePath(`/admin/courses/${result.data.courseId}`);
    return {
      status: "success",
      message: "Chapter created successfully",
    };
  } catch (error) {
    console.error("[createChapter] Error:", error);
    return {
      status: "error",
      message: "Failed to create chapter",
    };
  }
}

export async function createLesson(
  data: LessonSchemaType,
): Promise<ApiResponse> {
  console.log(
    `[AdminCourseAction] Creating lesson: ${data.name} (Chapter: ${data.chapterId}, Course: ${data.courseId})`,
  );
  await requireAdmin();
  try {
    const result = lessonSchema.safeParse(data);
    if (!result.success) {
      return {
        status: "error",
        message: result.error.issues[0]?.message ?? "Invalid data",
      };
    }
    const startTime = Date.now();
    await prisma.$transaction(async (tx) => {
      // 🛡️ Verify chapter belongs to course or just verify existence of relationship
      const chapter = await tx.chapter.findFirst({
        where: { id: result.data.chapterId, courseId: result.data.courseId },
        select: { id: true },
      });
      if (!chapter) throw new Error("Chapter not found in this course");

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
    console.log(`[createLesson] Transaction took ${Date.now() - startTime}ms`);

    // Invalidate analytics and dashboard caches
    console.log(
      `[createLesson] Invalidating caches for CourseId=${result.data.courseId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      // 1. Invalidate Actual Data
      invalidateCache(
        GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(result.data.courseId),
      ),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),

      // 2. Increment Versions (This triggers the yellow "UPDATE FOUND" on the client)
      await dirtyCourse(result.data.courseId),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);
    console.log(
      `[createLesson] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

    revalidatePath(`/admin/courses/${result.data.courseId}/edit`);
    return {
      status: "success",
      message: "Lesson created successfully",
    };
  } catch (error) {
    console.error("[createLesson] Error:", error);
    return {
      status: "error",
      message: "Failed to create lesson",
    };
  }
}

export async function importCourseStructure(
  courseId: string,
  input: unknown,
): Promise<ApiResponse> {
  console.log(`[AdminCourseAction] Importing course structure: ${courseId}`);
  await requireAdmin();

  try {
    const parsed = importCourseStructureSchema.safeParse(input);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Invalid JSON structure",
      };
    }

    const chapters = Array.isArray(parsed.data)
      ? parsed.data
      : parsed.data.chapters;

    const normalizedChapters = chapters.map((chapter) => ({
      title: (chapter.title ?? chapter.name ?? "").trim(),
      lessons: chapter.lessons.map((lesson) => ({
        title: (lesson.title ?? lesson.name ?? "").trim(),
        description: lesson.description?.trim() || null,
      })),
    }));

    const invalidChapter = normalizedChapters.find((chapter) => !chapter.title);
    if (invalidChapter) {
      return {
        status: "error",
        message: "Every chapter must have a title or name",
      };
    }

    const invalidLesson = normalizedChapters
      .flatMap((chapter) => chapter.lessons)
      .find((lesson) => !lesson.title);
    if (invalidLesson) {
      return {
        status: "error",
        message: "Every lesson must have a title or name",
      };
    }

    let lessonCount = 0;

    await prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });

      if (!course) throw new Error("Course not found");

      const maxPosition = await tx.chapter.findFirst({
        where: { courseId },
        select: { position: true },
        orderBy: { position: "desc" },
      });

      let chapterPosition = maxPosition?.position ?? 0;

      for (const chapter of normalizedChapters) {
        chapterPosition += 1;

        const createdChapter = await tx.chapter.create({
          data: {
            title: chapter.title,
            courseId,
            position: chapterPosition,
          },
          select: { id: true },
        });

        for (const [index, lesson] of chapter.lessons.entries()) {
          await tx.lesson.create({
            data: {
              title: lesson.title,
              description: textToRichTextJson(lesson.description),
              chapterId: createdChapter.id,
              position: index + 1,
            },
          });
          lessonCount += 1;
        }
      }
    });

    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      dirtyCourse(courseId),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);

    revalidatePath(`/admin/courses/${courseId}/edit`);

    return {
      status: "success",
      message: `Imported ${normalizedChapters.length} chapters and ${lessonCount} lessons`,
    };
  } catch (error) {
    console.error("[importCourseStructure] Error:", error);

    return {
      status: "error",
      message: "Failed to import course structure",
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
  console.log(
    `[AdminCourseAction] Deleting lesson ${lessonId} from chapter ${chapterId} (Course: ${courseId})`,
  );
  await requireAdmin();
  try {
    const startTime = Date.now();
    const chapterWithLessons = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
        courseId: courseId, // 🛡️ Scoping check!
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
    console.log(
      `[deleteLesson] Chapter Fetch took ${Date.now() - startTime}ms`,
    );

    if (!chapterWithLessons) {
      return {
        status: "error",
        message: "Chapter not found",
      };
    }

    const lessons = chapterWithLessons.lesson;
    const lessonFetchStart = Date.now();
    const lessonToDelete = await prisma.lesson.findUnique({
      where: { id: lessonId, chapterId: chapterId }, // 🛡️ Verify relationship
      select: { id: true, videoKey: true, thumbnailKey: true },
    });
    console.log(
      `[deleteLesson] Lesson Fetch took ${Date.now() - lessonFetchStart}ms`,
    );

    if (!lessonToDelete) {
      return {
        status: "error",
        message: "Lesson not found in this chapter",
      };
    }

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

    const transStartTime = Date.now();
    await prisma.$transaction([
      ...updates,
      prisma.lesson.delete({ where: { id: lessonId, chapterId: chapterId } }),
    ]);
    console.log(
      `[deleteLesson] Transaction took ${Date.now() - transStartTime}ms`,
    );

    // 🚀 After successful DB deletion, cleanup S3 files
    try {
      const { deleteS3File } = await import("@/lib/s3-delete-utils");
      if (lessonToDelete.videoKey) await deleteS3File(lessonToDelete.videoKey);
      if (lessonToDelete.thumbnailKey)
        await deleteS3File(lessonToDelete.thumbnailKey);
    } catch (cleanupError) {
      console.error("[deleteLesson] S3 Cleanup Error:", cleanupError);
      // Non-blocking for the user, but logged
    }

    // Invalidate analytics and dashboard caches
    console.log(
      `[deleteLesson] Invalidating caches for CourseId=${courseId} and LessonId=${lessonId}`,
    );
    const cacheStartTime = Date.now();
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(`lesson:${lessonId}`),
      invalidateCache(`lesson:questions:${lessonId}`),
      invalidateCache(`lesson:content:${lessonId}`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      await dirtyCourse(courseId),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
    ]);
    console.log(
      `[deleteLesson] Cache invalidation took ${Date.now() - cacheStartTime}ms`,
    );

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
  console.log(
    `[AdminCourseAction] Deleting chapter ${chapterId} (Course: ${courseId})`,
  );
  await requireAdmin();

  try {
    const startTime = Date.now();
    const courseWithChapters = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        chapter: {
          orderBy: { position: "asc" },
          select: { id: true, position: true },
        },
      },
    });
    console.log(
      `[deleteChapter] Course Fetch took ${Date.now() - startTime}ms`,
    );

    if (!courseWithChapters) {
      return { status: "error", message: "Course not found" };
    }

    const chapStartTime = Date.now();
    const chapterToDelete = await prisma.chapter.findUnique({
      where: { id: chapterId, courseId: courseId }, // 🛡️ Scoping verification!
      include: {
        lesson: {
          select: { videoKey: true, thumbnailKey: true },
        },
      },
    });
    console.log(
      `[deleteChapter] Chapter Fetch took ${Date.now() - chapStartTime}ms`,
    );

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

    const remainingChapters = courseWithChapters.chapter.filter(
      (c) => c.id !== chapterId,
    );

    const updates = remainingChapters.map((chapter, index) =>
      prisma.chapter.update({
        where: { id: chapter.id },
        data: { position: index + 1 },
      }),
    );

    const transStartTime = Date.now();
    await prisma.$transaction([
      ...updates,
      prisma.chapter.delete({
        where: { id: chapterId },
      }),
    ]);
    console.log(
      `[deleteChapter] Transaction took ${Date.now() - transStartTime}ms`,
    );

    // 🚀 After successful DB deletion, cleanup S3 files
    try {
      if (keysToDelete.size > 0) {
        await Promise.all(
          Array.from(keysToDelete).map((key) => deleteS3File(key)),
        );
      }
    } catch (cleanupError) {
      console.error("[deleteChapter] S3 Cleanup Error:", cleanupError);
    }

    // Invalidate analytics and dashboard caches
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:static`),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSE_VERSION(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
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
  console.log(
    `[AdminCourseAction] Renaming chapter ${chapterId} to "${name}" (Course: ${courseId})`,
  );
  await requireAdmin();

  try {
    if (!name || name.trim().length === 0) {
      return {
        status: "error",
        message: "Chapter name cannot be empty",
      };
    }

    const updateStartTime = Date.now();
    await prisma.chapter.update({
      where: {
        id: chapterId,
        courseId, // 🛡️ Scoping verified here
      },
      data: {
        title: name.trim(),
      },
    });
    console.log(
      `[editChapter] DB Update took ${Date.now() - updateStartTime}ms`,
    );

    // Invalidate analytics and dashboard caches
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(courseId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
      await dirtyCourse(courseId),
    ]);

    // Revalidate the edit page
    revalidatePath(`/admin/courses/${courseId}/edit`);

    return {
      status: "success",
      message: "Chapter updated successfully",
    };
  } catch (error) {
    console.error("[editChapter] Error:", error);
    return {
      status: "error",
      message: "Failed to update chapter",
    };
  }
}

export async function adminGetCourseAction(id: string, clientVersion?: string) {
  return await adminGetCourse(id, clientVersion);
}
