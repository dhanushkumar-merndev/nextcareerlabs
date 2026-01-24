"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { EnrollmentStatus } from "@/generated/prisma";
import { invalidateCache, CHAT_CACHE_KEYS, GLOBAL_CACHE_KEYS, incrementGlobalVersion } from "@/lib/redis";

export async function getRequestsAction(
  skip: number,
  take: number,
  status?: EnrollmentStatus | "All",
  startDate?: Date,
  endDate?: Date
) {
  return await adminGetEnrollmentRequests(skip, take, status, startDate, endDate);
}

export async function updateEnrollmentStatusAction(
  enrollmentId: string,
  status: "Granted" | "Revoked" | "Pending"
): Promise<ApiResponse> {
  await requireAdmin();

  try {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { 
        status,
        grantedAt: status === "Granted" ? new Date() : undefined,
      },
    });

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true }
    });
    if (enrollment) {
      await invalidateCache(CHAT_CACHE_KEYS.THREADS(enrollment.userId));
      
      // Invalidate group participants cache if this enrollment is for a course
      const courseGroup = await prisma.chatGroup.findFirst({
          where: { courseId: (await prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { courseId: true }}))?.courseId },
          select: { id: true }
      });
      if (courseGroup) {
          await invalidateCache(CHAT_CACHE_KEYS.PARTICIPANTS(courseGroup.id));
      }

      // Invalidate analytics
      await Promise.all([
          invalidateCache(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS),
          invalidateCache(GLOBAL_CACHE_KEYS.USER_ENROLLMENTS(enrollment.userId)),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(enrollment.userId))
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
    await prisma.user.update({
      where: { id: userId },
      data: { banned: true },
    });

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
    await prisma.user.update({
      where: { id: userId },
      data: { banned: false },
    });

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
    await prisma.user.update({
      where: { id: userId },
      data,
    });

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
    await prisma.enrollment.delete({
      where: { id: enrollmentId },
    });

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
