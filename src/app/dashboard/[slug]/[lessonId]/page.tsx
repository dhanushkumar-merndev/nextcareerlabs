import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { CourseContent } from "./_components/CourseContent";
import { Suspense } from "react";
import { LessonContentSkeleton } from "./_components/lessonSkeleton";

type Params = Promise<{ lessonId: string }>;

export default async function LessonContentPage({
  params,
}: {
  params: Params;
}) {
  const { lessonId } = await params;

  return (
    <Suspense fallback={<LessonContentSkeleton />}>
      <LessonContentLoader lessonId={lessonId} />;
    </Suspense>
  );
}

async function LessonContentLoader({ lessonId }: { lessonId: string }) {
  const data = await getLessonContent(lessonId);
  return <CourseContent data={data} />;
}
