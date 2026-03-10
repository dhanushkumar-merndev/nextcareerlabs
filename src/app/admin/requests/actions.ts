"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { EnrollmentStatus } from "@/generated/prisma";
import {
  invalidateCache,
  CHAT_CACHE_KEYS,
  GLOBAL_CACHE_KEYS,
  incrementGlobalVersion,
  invalidateAllAdminCache,
  invalidateUserEnrollmentCache,
} from "@/lib/redis";

export async function getRequestsAction(
  skip: number,
  take: number,
  status?: EnrollmentStatus | "All",
  search?: string,
  clientVersion?: string,
) {
  console.log(
    `[AdminRequestAction] Fetching requests (Status: ${status}, Search: ${search}, ClientVersion: ${clientVersion || "none"})`,
  );
  return await adminGetEnrollmentRequests(
    skip,
    take,
    status,
    search,
    clientVersion,
  );
}

export async function updateEnrollmentStatusAction(
  enrollmentId: string,
  status: "Granted" | "Revoked" | "Pending",
): Promise<ApiResponse> {
  console.log(
    `[AdminRequestAction] Updating enrollment ${enrollmentId} to status ${status}`,
  );
  await requireAdmin();

  try {
    const updateStartTime = Date.now();
    const enrollment = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status,
        grantedAt: status === "Granted" ? new Date() : undefined,
      },
      select: {
        userId: true,
        courseId: true,
        Course: {
          select: { slug: true },
        },
      },
    });

    const updateDuration = Date.now() - updateStartTime;
    console.log(
      `[updateEnrollmentStatusAction] DB Update + Fetch took ${updateDuration}ms`,
    );

    // NOTE: We don't set the cookie here because this is an ADMIN action.
    // The user's browser will sync its own cookie via DashboardShell when it
    // detects the new enrollment via the client-side API/fetch.

    if (enrollment) {
      // Find course group for participants invalidation
      const courseGroup = await prisma.chatGroup.findFirst({
        where: { courseId: enrollment.courseId },
        select: { id: true },
      });

      // Collective invalidation (Admin + User)
      const invalidations: Promise<any>[] = [
        invalidateCache(CHAT_CACHE_KEYS.THREADS(enrollment.userId)),
        courseGroup
          ? invalidateCache(CHAT_CACHE_KEYS.PARTICIPANTS(courseGroup.id))
          : Promise.resolve(),

        // Admin Keys (Centralized Invalidation)
        invalidateAllAdminCache(),

        // Support for User Synchronicity (Unified)
        invalidateUserEnrollmentCache(enrollment.userId),

        // Versions (The triggers)
        incrementGlobalVersion(GLOBAL_CACHE_KEYS.COURSES_VERSION), // Force global list refresh
        incrementGlobalVersion(CHAT_CACHE_KEYS.VERSION(enrollment.userId)),
      ];

      // On Grant, also invalidate specific user course caches to reflect enrollment status
      if (status === "Granted") {
        invalidations.push(
          invalidateCache(
            GLOBAL_CACHE_KEYS.COURSE_DETAIL(enrollment.Course.slug),
          ), // Use standardized key
          invalidateCache(`course:${enrollment.Course.slug}`), // Support older variant
        );
      }

      await Promise.all(invalidations);
    }

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/dashboard/available-courses");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/resources");
    revalidatePath(`/courses/${enrollment.Course.slug}`);
    revalidatePath(`/admin/analytics`);
    revalidatePath(`/admin/dashboard`);

    return {
      status: "success",
      message: `Enrollment status updated to ${status}`,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to update enrollment status",
    };
  }
}

export async function banUserAction(userId: string): Promise<ApiResponse> {
  console.log(`[AdminRequestAction] Banning user ${userId}`);
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { banned: true },
      }),
      prisma.enrollment.updateMany({
        where: { userId },
        data: { status: "Revoked" },
      }),
    ]);
    console.log(
      `[banUserAction] DB Update (Ban + Revoke) took ${Date.now() - startTime}ms`,
    );

    // Invalidate user caches and admin list (Centralized)
    await Promise.all([
      invalidateAllAdminCache(),

      // User specific invalidation (Unified)
      invalidateUserEnrollmentCache(userId),

      // Versions (The triggers)
      incrementGlobalVersion(CHAT_CACHE_KEYS.VERSION(userId)),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/dashboard/available-courses");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
    revalidatePath("/admin/resources");
    revalidatePath(`/admin/dashboard`);
    return {
      status: "success",
      message: "User has been banned",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to ban user",
    };
  }
}

export async function unbanUserAction(userId: string): Promise<ApiResponse> {
  console.log(`[AdminRequestAction] Unbanning user ${userId}`);
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: { banned: false },
    });
    console.log(`[unbanUserAction] DB Update took ${Date.now() - startTime}ms`);

    // Invalidate user caches and admin list (Centralized)
    await Promise.all([
      invalidateAllAdminCache(),

      // User specific invalidation (Unified)
      invalidateUserEnrollmentCache(userId),

      // Versions (The triggers)
      incrementGlobalVersion(CHAT_CACHE_KEYS.VERSION(userId)),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/dashboard/available-courses");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
    revalidatePath("/admin/resources");
    revalidatePath(`/admin/dashboard`);
    return {
      status: "success",
      message: "User has been unbanned",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to unban user",
    };
  }
}

export async function updateUserDetailsAction(
  userId: string,
  data: { email?: string; phoneNumber?: string },
): Promise<ApiResponse> {
  console.log(
    `[AdminRequestAction] Updating user details for ${userId}: ${JSON.stringify(data)}`,
  );
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data,
    });
    console.log(
      `[updateUserDetailsAction] DB Update took ${Date.now() - startTime}ms`,
    );

    // Invalidate enrollment list since user details changed
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/dashboard/available-courses");
    revalidatePath("/admin/resources");
    revalidatePath(`/admin/dashboard`);
    return {
      status: "success",
      message: "User details updated successfully",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to update user details",
    };
  }
}

export async function deleteEnrollmentAction(
  enrollmentId: string,
): Promise<ApiResponse> {
  console.log(`[AdminRequestAction] Deleting enrollment ${enrollmentId}`);
  await requireAdmin();

  try {
    const startTime = Date.now();

    // Find enrollment details first for user-specific invalidation
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        userId: true,
        courseId: true,
        Course: { select: { slug: true } },
      },
    });

    if (!enrollment) {
      return {
        status: "error",
        message: "Enrollment not found",
      };
    }

    // Find course group for participants invalidation
    const courseGroup = await prisma.chatGroup.findFirst({
      where: { courseId: enrollment.courseId },
      select: { id: true },
    });

    await prisma.enrollment.delete({
      where: { id: enrollmentId },
    });
    console.log(
      `[deleteEnrollmentAction] DB Delete took ${Date.now() - startTime}ms`,
    );

    // Smart Sync Invalidation (Centralized Admin + User Specific)
    await Promise.all([
      invalidateAllAdminCache(),
      courseGroup
        ? invalidateCache(CHAT_CACHE_KEYS.PARTICIPANTS(courseGroup.id))
        : Promise.resolve(),

      // User invalidation (Unified)
      invalidateUserEnrollmentCache(enrollment.userId),
      invalidateCache(GLOBAL_CACHE_KEYS.COURSE_DETAIL(enrollment.Course.slug)),

      // Versions (The triggers)
      incrementGlobalVersion(CHAT_CACHE_KEYS.VERSION(enrollment.userId)),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/my-courses");
    revalidatePath("/dashboard/available-courses");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/resources");
    revalidatePath("/admin/analytics");
    revalidatePath(`/admin/dashboard`);

    return {
      status: "success",
      message: "Enrollment request deleted successfully",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Failed to delete enrollment request",
    };
  }
}
