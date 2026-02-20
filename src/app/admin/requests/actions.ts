"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath } from "next/cache";
import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { EnrollmentStatus } from "@/generated/prisma";
import { invalidateCache, CHAT_CACHE_KEYS, GLOBAL_CACHE_KEYS, incrementGlobalVersion } from "@/lib/redis";

export async function getRequestsAction(
  skip: number,
  take: number,
  status?: EnrollmentStatus | "All",
  search?: string,
  clientVersion?: string
) {
  return await adminGetEnrollmentRequests(skip, take, status, search, clientVersion);
}

export async function updateEnrollmentStatusAction(
  enrollmentId: string,
  status: "Granted" | "Revoked" | "Pending"
): Promise<ApiResponse> {
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
        courseId: true
      }
    });

    const updateDuration = Date.now() - updateStartTime;
    console.log(`[updateEnrollmentStatusAction] DB Update + Fetch took ${updateDuration}ms`);
    
    if (enrollment) {
      // Find course group for participants invalidation
      const courseGroup = await prisma.chatGroup.findFirst({
          where: { courseId: enrollment.courseId },
          select: { id: true }
      });

      // Collective invalidation
      await Promise.all([
          invalidateCache(CHAT_CACHE_KEYS.THREADS(enrollment.userId)),
          courseGroup ? invalidateCache(CHAT_CACHE_KEYS.PARTICIPANTS(courseGroup.id)) : Promise.resolve(),
          invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
          invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(enrollment.userId)),
          invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(enrollment.userId)),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION)
      ]);
    }

    revalidatePath("/admin/requests");
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
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: { banned: true },
    });
    console.log(`[banUserAction] DB Update took ${Date.now() - startTime}ms`);

    // Invalidate enrollment list since ban status changed
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION)
    ]);

    revalidatePath("/admin/requests");
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
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: { banned: false },
    });
    console.log(`[unbanUserAction] DB Update took ${Date.now() - startTime}ms`);

    // Invalidate enrollment list since ban status changed
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION)
    ]);

    revalidatePath("/admin/requests");
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
  data: { email?: string; phoneNumber?: string }
): Promise<ApiResponse> {
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data,
    });
    console.log(`[updateUserDetailsAction] DB Update took ${Date.now() - startTime}ms`);
    
    // Invalidate enrollment list since user details changed
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION)
    ]);

    revalidatePath("/admin/requests");
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
  enrollmentId: string
): Promise<ApiResponse> {
  await requireAdmin();

  try {
    const startTime = Date.now();
    await prisma.enrollment.delete({
      where: { id: enrollmentId },
    });
    console.log(`[deleteEnrollmentAction] DB Delete took ${Date.now() - startTime}ms`);

    // Smart Sync Invalidation
    await Promise.all([
      invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_LIST),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ENROLLMENTS_VERSION),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_DASHBOARD_STATS_VERSION)
    ]);

    revalidatePath("/admin/requests");
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
