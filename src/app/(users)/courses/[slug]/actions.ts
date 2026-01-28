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
import { GLOBAL_CACHE_KEYS, incrementGlobalVersion } from "@/lib/redis";

// Get Individual Course Action
export async function getIndividualCourseAction(slug: string, clientVersion?: string) {
    return await getIndividualCourse(slug, clientVersion);
}

// Get Slug Page Data Action
export async function getSlugPageDataAction(slug: string, clientVersion?: string) {
    console.log(`[SlugAction] Fetching data for: ${slug} (Client version: ${clientVersion || 'none'})`);
    const result = await getIndividualCourse(slug, clientVersion);
    // If getIndividualCourse returns null, it means the course doesn't exist
    if (!result) {
        console.error(`[SlugAction] getIndividualCourse returned null for ${slug}`);
        return null;
    }
    // If getIndividualCourse returns { status: "not-modified" }, it means the course is up to date
    if ((result as any).status === "not-modified") {
        console.log(`[SlugAction] Version match for ${slug}`);
        return { status: "not-modified", version: result.version };
    }

    // Extract the course object correctly. getIndividualCourse returns { course, version }
    // but we handle cases where it might return the course object directly if that ever happens.
    const course = (result as any).course || ((result as any).id ? result : null);
    // If getIndividualCourse returns a course object without an id, it means the course doesn't exist
    if (!course || !(course as any).id) {
        console.error(`[SlugAction] Could not find course in result for ${slug}`, result);
        return null;
    }
    // If getIndividualCourse returns a course object with an id, it means the course exists
    if (course && "id" in course) {
        console.log(`[SlugAction] Found course ${course.id}. Fetching enrollment...`);
        // Get the session
        const session = await auth.api.getSession({
            headers: await headers()
        });
        // If the user is logged in, check if they are enrolled in the course
        let enrollmentStatus = null;
        if (session?.user) {
            enrollmentStatus = await checkIfCourseBought((course as any).id);
        }
        // Return the course object, enrollment status, and version
        return {
            course: (result as any).course || result, // Ensure we return the course object
            enrollmentStatus,
            isProfileComplete: true,
            requireName: false,
            version: (result as any).version || (result as any).currentVersion
        };
    }
    // If getIndividualCourse returns a course object with an id, it means the course exists
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

    // Invalidate caches to show updated status immediately
    await incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION);
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
