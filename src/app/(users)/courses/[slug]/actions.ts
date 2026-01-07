"use server";

import { requireUser } from "@/app/data/user/require-user";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 5,
  })
);

export async function enrollInCourseAction(
  courseId: string
): Promise<ApiResponse> {
  const user = await requireUser();

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

    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id,
        },
      },
    });

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
