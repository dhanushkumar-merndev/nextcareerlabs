import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { EnrollmentStatus } from "@/generated/prisma";

export async function adminGetEnrollmentRequests(
  skip: number = 0,
  take: number = 10,
  status?: EnrollmentStatus | "All",
  search?: string
) {
  await requireAdmin();

  const baseWhere: any = {};

  if (search) {
    baseWhere.User = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  if (status && status !== "All") {
    baseWhere.status = status;
  }

  // 1. Get total count for the filtered set
  const totalCount = await prisma.enrollment.count({
    where: baseWhere,
  });

  let enrollments: any[] = [];

  // Logic: Always show ALL pending if we are on the first page and no specific status filter is active
  // OR if we are specifically filtering for Pending.
  if (skip === 0 && (!status || status === "All" || status === "Pending")) {
    const pendingWhere = { ...baseWhere, status: "Pending" as EnrollmentStatus };
    const pending = await prisma.enrollment.findMany({
      where: pendingWhere,
      include: {
        Course: { select: { title: true, id: true } },
        User: { select: { id: true, name: true, email: true, phoneNumber: true, image: true, createdAt: true, banned: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    enrollments = [...pending];

    // If we have fewer than 'take' items, backfill with others
    if (enrollments.length < take && (!status || status === "All")) {
      const others = await prisma.enrollment.findMany({
        where: { ...baseWhere, status: { not: "Pending" } },
        include: {
          Course: { select: { title: true, id: true } },
          User: { select: { id: true, name: true, email: true, phoneNumber: true, image: true, createdAt: true, banned: true } },
        },
        orderBy: { createdAt: "desc" },
        take: take - enrollments.length,
      });
      enrollments = [...enrollments, ...others];
    }
  } else {
    // Normal pagination for subsequent pages or specific filters
    enrollments = await prisma.enrollment.findMany({
      where: baseWhere,
      include: {
        Course: { select: { title: true, id: true } },
        User: { select: { id: true, name: true, email: true, phoneNumber: true, image: true, createdAt: true, banned: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  return {
    data: enrollments,
    totalCount,
  };
}
