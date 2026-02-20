import "server-only";
import { prisma } from "@/lib/db";
import { requireAdmin } from "./require-admin";
import { notFound } from "next/navigation";

export async function adminGetLesson(id: string) {
  await requireAdmin();

  const startTime = Date.now();
  const data = await prisma.lesson.findUnique({
    where: {
      id: id,
    },
    select: {
      title: true,
      videoKey: true,
      thumbnailKey: true,
      description: true,
      id: true,
      position: true,
      duration: true,
      spriteKey: true,
      spriteCols: true,
      spriteRows: true,
      spriteInterval: true,
      spriteWidth: true,
      spriteHeight: true,
      lowResKey: true,
    },
  });
  const duration = Date.now() - startTime;
  console.log(`[adminGetLesson] DB Fetch took ${duration}ms for ID: ${id}`);

  if (!data) {
    return notFound();
  }

  return data;
}

export type AdminLessonType = Awaited<ReturnType<typeof adminGetLesson>>;
