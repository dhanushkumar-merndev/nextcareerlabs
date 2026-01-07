import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { EnrollmentStatus } from "@/generated/prisma";

export async function adminGetEnrollmentRequests(
  skip: number = 0,
  take: number = 100,
  status?: EnrollmentStatus | "All",
  startDate?: Date,
  endDate?: Date
) {
  await requireAdmin();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: status && status !== "All" ? status : undefined,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      Course: {
        select: {
          title: true,
          id: true,
        },
      },
      User: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          image: true,
          createdAt: true,
          banned: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take,
  });

  return enrollments;
}
