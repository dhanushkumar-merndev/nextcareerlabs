import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { CourseContent } from "./_components/CourseContent";
import { Suspense } from "react";
import { LessonContentSkeleton } from "./_components/lessonSkeleton";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

type Params = Promise<{ lessonId: string }>;

export default async function LessonContentPage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { lessonId } = await params;

  return (
    <Suspense fallback={<LessonContentSkeleton />}>
      <CourseContent lessonId={lessonId} userId={user.id} />
    </Suspense>
  );
}
