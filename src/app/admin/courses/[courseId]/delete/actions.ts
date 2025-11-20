"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";

export async function deleteCourse(courseId: string): Promise<ApiResponse> {
  await requireAdmin();
  try {
    await prisma.course.delete({
      where: {
        id: courseId,
      },
    });
    return {
      status: "success",
      message: "Course Deleted Successfully",
    };
  } catch {
    return {
      status: "error",
      message: "Failed to delete course!",
    };
  }
}
