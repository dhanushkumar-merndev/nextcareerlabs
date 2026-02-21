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
      transcription: {
        select: {
          id: true,
          vttUrl: true,
          status: true,
        },
      },
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });
  const duration = Date.now() - startTime;
  console.log(`[adminGetLesson] DB Fetch took ${duration}ms for ID: ${id}`);

  if (!data) {
    return notFound();
  }

  // Format the transcription URL if it exists
  const formattedData = {
    ...data,
    transcription: data.transcription
      ? {
          ...data.transcription,
          vttUrl: data.transcription.vttUrl.startsWith("http")
            ? data.transcription.vttUrl
            : `https://${process.env.S3_BUCKET_NAME}.t3.storage.dev/${data.transcription.vttUrl}`,
          hasMCQs: data._count.questions > 0,
        }
      : null,
  };

  return formattedData;
}

export type AdminLessonType = Awaited<ReturnType<typeof adminGetLesson>>;
