"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet from "@/lib/arcjet";

import { prisma } from "@/lib/db";

import { ApiResponse } from "@/lib/types/auth";
import { courseSchema, CourseSchemaType } from "@/lib/zodSchemas";
import { fixedWindow, request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { invalidateCache, incrementGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

export async function CreateCourse(
  values: CourseSchemaType
): Promise<ApiResponse> {
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

    const validation = courseSchema.safeParse(values);
    if (!validation.success) {
      return {
        status: "error",
        message: "Invalid Data",
      };
    }

    const existingStartTime = Date.now();
    const existingCourse = await prisma.course.findUnique({
      where: {
        slug: validation.data.slug,
      },
      select: {
        id: true,
      },
    });
    const existingDuration = Date.now() - existingStartTime;
    console.log(`[CreateCourse] Slug check took ${existingDuration}ms`);

    if (existingCourse) {
      return {
        status: "error",
        message: "Course with this slug already exists",
      };
    }

    const createStartTime = Date.now();
    const createdCourse = await prisma.course.create({
      data: {
        ...validation.data,
        fileKey: validation.data.fileKey ?? "",
        userId: session.user.id,
      },
    });
    const createDuration = Date.now() - createStartTime;
    console.log(`[CreateCourse] DB Create took ${createDuration}ms`);

    // Auto-create Broadcast Group if Published on creation
    if (validation.data.status === "Published") {
      await prisma.chatGroup.create({
          data: {
              name: `${validation.data.title} Group`,
              courseId: createdCourse.id,
              imageUrl: validation.data.fileKey 
          }
      });
    }

    // Invalidate global courses and analytics cache
    await Promise.all([
        invalidateCache(GLOBAL_CACHE_KEYS.COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_COURSES_LIST),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(createdCourse.slug)),
        invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL_BY_ID(createdCourse.id)),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
        invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:recent_courses`),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_AVERAGE_PROGRESS),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_CHAT_SIDEBAR),
        invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_ALL),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_RECENT_COURSES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_THREADS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_CHAT_MESSAGES_VERSION),
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_VERSION),
    ]);

    revalidatePath("/courses");
    revalidatePath(`/courses/${createdCourse.slug}`);
    revalidatePath("/admin/resources");

    return {
      status: "success",
      message: "Course Created Successfully",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to create course",
    };
  }
}
