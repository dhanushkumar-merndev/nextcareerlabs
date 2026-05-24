/**
 * Actions for Course Details
 */

"use server";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";
import { getIndividualCourse } from "@/app/data/course/get-course";
import { checkIfCourseBought } from "@/app/data/user/user-is-enrolled";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { GLOBAL_CACHE_KEYS, incrementGlobalVersion, invalidateCache, invalidateUserEnrollmentCache } from "@/lib/redis";

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

  if ("status" in result && result.status === "not-modified") {
    console.log(`[SlugAction] Version match for ${slug}`);
    return { status: "not-modified", version: result.version };
  }

  const course = "course" in result ? (result.course as { id: string } | null) : null;
  if (!course || !course.id) {
    console.error(`[SlugAction] Could not find course in result for ${slug}`, result);
    return null;
  }

  if (course && "id" in course) {
    let enrollmentStatus = null;
    if (finalUserId) {
      enrollmentStatus = await checkIfCourseBought(course.id, finalUserId);
    }

    return {
      course: "course" in result ? result.course : result,
      enrollmentStatus,
      isProfileComplete: true,
      requireName: false,
      version: result.version,
      instantSync: false,
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
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return {
      status: "error",
      message: "Please login to request access",
    };
  }

  const user = session.user;

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
        isFree: true,
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
          enrollmentStatus: "Granted",
          message: "You are already enrolled in this course",
        };
      }
      if (existingEnrollment.status === "Pending") {
        return {
          status: "error",
          message: "Access request is already pending",
        };
      }
      // If Rejected or Revoked, we allow re-requesting
      // For free courses, auto-grant; for paid courses, set to Pending
      const newStatus = course.isFree ? "Granted" : "Pending";
      if (!course.isFree) {
        const userWithPhone = await prisma.user.findUnique({
          where: { id: user.id },
          select: { phoneNumber: true },
        });
        if (!userWithPhone?.phoneNumber) {
          return {
            status: "error",
            message: "Please complete your profile with a phone number before requesting access to paid courses.",
          };
        }
      }
      await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: {
          status: newStatus,
          grantedAt: course.isFree ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    } else {
      // For free courses, auto-grant access; for paid courses, require admin approval
      if (!course.isFree) {
        const userWithPhone = await prisma.user.findUnique({
          where: { id: user.id },
          select: { phoneNumber: true },
        });
        if (!userWithPhone?.phoneNumber) {
          return {
            status: "error",
            message: "Please complete your profile with a phone number before requesting access to paid courses.",
          };
        }
      }
      const newStatus = course.isFree ? "Granted" : "Pending";
      await prisma.enrollment.create({
        data: {
          userId: user.id,
          courseId: course.id,
          status: newStatus,
          grantedAt: course.isFree ? new Date() : null,
        },
      });
    }

    // Invalidate caches to show updated status immediately (Admin & User side)
    await Promise.all([
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(user.id)),
      invalidateUserEnrollmentCache(user.id),
      invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(user.id, "latest")),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS),
      invalidateCache(`${GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS}:enrollments`),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(course.slug)),
      invalidateCache(`user:enrollment-map:${user.id}:*`),
    ]);

    // Invalidate Local Storage Keys (Next.js server-side can't directly manipulate localStorage, 
    // but we can increment the COURSE_VERSION which forces a re-fetch, and use revalidatePath)

    revalidatePath(`/courses`);
    revalidatePath(`/dashboard`);
    revalidatePath(`/dashboard/my-courses`);
    revalidatePath(`/dashboard/available-courses`);
    revalidatePath(`/courses/${course.slug}`);
    revalidatePath(`/dashboard/resources`);
    revalidatePath("/admin/requests");
    revalidatePath("/admin/resources");

    return {
      status: "success",
      enrollmentStatus: course.isFree ? "Granted" : "Pending",
      message: course.isFree
        ? "You now have access to this free course. Happy learning!"
        : "Access requested successfully. Please wait for admin approval.",
    };
  } catch  {
    return {
      status: "error",
      message: "Failed to Enroll in Course",
    };
  }
}
