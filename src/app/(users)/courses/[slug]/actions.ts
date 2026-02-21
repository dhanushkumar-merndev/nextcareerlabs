/**
 * Actions for Course Details
 */

"use server";
import { requireUser } from "@/app/data/user/require-user";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { getIndividualCourse } from "@/app/data/course/get-course";
import { checkIfCourseBought } from "@/app/data/user/user-is-enrolled";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { GLOBAL_CACHE_KEYS, incrementGlobalVersion, invalidateCache } from "@/lib/redis";

// Get Individual Course Action
export async function getIndividualCourseAction(slug: string, clientVersion?: string) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    return await getIndividualCourse(slug, clientVersion, session?.user?.id);
}

// Get Slug Page Data Action
export async function getSlugPageDataAction(slug: string, clientVersion?: string, userId?: string) {
    console.log(`[SlugAction] Fetching data for: ${slug} (Client version: ${clientVersion || 'none'}, UserId: ${userId || 'none'})`);
    
    let finalUserId = userId;
    if (!finalUserId) {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        finalUserId = session?.user?.id;
    }

    const result = await getIndividualCourse(slug, clientVersion, finalUserId);
    
    if (!result) {
        console.error(`[SlugAction] getIndividualCourse returned null for ${slug}`);
        return null;
    }

    if ((result as any).status === "not-modified") {
        console.log(`[SlugAction] Version match for ${slug}`);
        return { status: "not-modified", version: result.version };
    }

    const course = (result as any).course || ((result as any).id ? result : null);
    if (!course || !(course as any).id) {
        console.error(`[SlugAction] Could not find course in result for ${slug}`, result);
        return null;
    }

    if (course && "id" in course) {
        console.log(`[SlugAction] Found course ${course.id}. Fetching enrollment...`);
        
        let finalUserId = userId;
        if (!finalUserId) {
            const session = await auth.api.getSession({
                headers: await headers()
            });
            finalUserId = session?.user?.id;
        }

        let enrollmentStatus = null;
        if (finalUserId) {
            enrollmentStatus = await checkIfCourseBought((course as any).id, finalUserId);
        }

        return {
            course: (result as any).course || result, 
            enrollmentStatus,
            isProfileComplete: true,
            requireName: false,
            version: (result as any).version || (result as any).currentVersion,
            instantSync: (result as any).instantSync ?? false
        };
    }
    return null;
}


const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 5,
  })
);

// Enroll in Course Action
export async function enrollInCourseAction(
  courseId: string
): Promise<ApiResponse> {
  const user = await requireUser();
  // Check if the user is blocked
  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: user.id,
    });

    if (decision.isDenied()) {
      return {
        status: "error",
        message: "You have be blocked",
      };
    }
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        slug: true,
      },
    });

    if (!course) {
      return {
        status: "error",
        message: "Course not found",
      };
    }
    // Check if the user is already enrolled in the course
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id,
        },
      },
    });
    // If the user is already enrolled in the course, return success
    if (existingEnrollment) {
      if (existingEnrollment.status === "Granted") {
        return {
          status: "success",
          message: "You are already enrolled in this course",
        };
      }
      if (existingEnrollment.status === "Pending") {
        return {
          status: "error",
          message: "Access request is already pending",
        };
      }
      // If Rejected or Revoked, we allow re-requesting by updating the status to Pending
      await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: {
          status: "Pending",
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.enrollment.create({
        data: {
          userId: user.id,
          courseId: course.id,
          status: "Pending",
        },
      });
    }

    // Invalidate caches to show updated status immediately (Admin & User side)
    await Promise.all([
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`),
      invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(user.id)),
    ]);
    
    // Invalidate Local Storage Keys (Next.js server-side can't directly manipulate localStorage, 
    // but we can increment the COURSE_VERSION which forces a re-fetch, and use revalidatePath)
    
    revalidatePath(`/courses`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/courses/${course.slug}`);
    revalidatePath("/admin/requests");

    return {
      status: "success",
      message: "Access requested successfully. Please wait for admin approval.",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to Enroll in Course",
    };
  }
}
