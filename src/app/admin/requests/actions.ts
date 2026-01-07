"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { adminGetEnrollmentRequests } from "@/app/data/admin/admin-get-requests";
import { EnrollmentStatus } from "@/generated/prisma";

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
