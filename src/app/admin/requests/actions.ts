"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { EnrollmentStatus } from "@/generated/prisma";
import { invalidateCache, CHAT_CACHE_KEYS, GLOBAL_CACHE_KEYS, incrementGlobalVersion, incrementChatVersion, invalidateAllAdminCache } from "@/lib/redis";

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
        courseId: true,
        Course: {
          select: { slug: true }
        }
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

      // Collective invalidation (Admin + User)
      const invalidations: Promise<any>[] = [
          invalidateCache(CHAT_CACHE_KEYS.THREADS(enrollment.userId)),
          courseGroup ? invalidateCache(CHAT_CACHE_KEYS.PARTICIPANTS(courseGroup.id)) : Promise.resolve(),
          
          // Admin Keys (Centralized Invalidation)
          invalidateAllAdminCache(),

          // Support for User Synchronicity
          invalidateCache(`user:dashboard:${enrollment.userId}`),
          invalidateCache(`user:enrollments:${enrollment.userId}`),
          invalidateCache(`available_courses_${enrollment.userId}`),
          invalidateCache(`user_dashboard_${enrollment.userId}`), 

          // Versions (The triggers)
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(enrollment.userId)),
          incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION),
          incrementChatVersion(enrollment.userId),
      ];

      // On Grant, also invalidate specific user course caches to reflect enrollment status
      if (status === "Granted") {
          invalidations.push(
              invalidateCache(`course:${enrollment.Course.slug}`),
              invalidateCache(`global:course:${enrollment.Course.slug}`) // Support both variants
          );
      }

      await Promise.all(invalidations);
    }

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/my-courses");
    revalidatePath("/available-courses");
    revalidatePath("/resources");

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
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { banned: true },
      }),
      prisma.enrollment.updateMany({
        where: { userId },
        data: { status: "Revoked" }
      })
    ]);
    console.log(`[banUserAction] DB Update (Ban + Revoke) took ${Date.now() - startTime}ms`);

    // Invalidate user caches and admin list (Centralized)
    await Promise.all([
      invalidateAllAdminCache(),
      
      // User specific invalidation
      invalidateCache(`user:dashboard:${userId}`),
      invalidateCache(`user:enrollments:${userId}`),
      invalidateCache(`available_courses_${userId}`),
      
      // Versions (The triggers)
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION),
      incrementChatVersion(userId),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/my-courses");
    revalidatePath("/available-courses");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
    revalidatePath("/resources");
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

    // Invalidate user caches and admin list (Centralized)
    await Promise.all([
      invalidateAllAdminCache(),
      
      // User specific invalidation
      invalidateCache(`user:dashboard:${userId}`),
      invalidateCache(`user:enrollments:${userId}`),
      invalidateCache(`available_courses_${userId}`),
  
      // Versions (The triggers)
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(userId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION),
      incrementChatVersion(userId),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/my-courses");
    revalidatePath("/available-courses");
    revalidatePath("/resources");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
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
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");
    revalidatePath("/my-courses");
    revalidatePath("/available-courses");
    revalidatePath("/resources");
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
    
    // Find enrollment details first for user-specific invalidation
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { 
        userId: true,
        Course: { select: { slug: true } }
      }
    });

    if (!enrollment) {
        return {
          status: "error",
          message: "Enrollment not found",
        };
    }

    await prisma.enrollment.delete({
      where: { id: enrollmentId },
    });
    console.log(`[deleteEnrollmentAction] DB Delete took ${Date.now() - startTime}ms`);

    // Smart Sync Invalidation (Centralized Admin + User Specific)
    await Promise.all([
      invalidateAllAdminCache(),
      
      // User invalidation
      invalidateCache(`user_enrolled_courses_${enrollment.userId}`),
      invalidateCache(`available_courses_${enrollment.userId}`),
      invalidateCache(`user:dashboard:${enrollment.userId}`),
      invalidateCache(`course:${enrollment.Course.slug}`),

      // Versions (The triggers)
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(enrollment.userId)),
      incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION),
      incrementChatVersion(enrollment.userId),
    ]);

    revalidatePath("/admin/requests");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/my-courses");
    revalidatePath("/available-courses");
    revalidatePath("/resources");
    revalidatePath("/dashboard/resources");
    revalidatePath("/admin/analytics");

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
