import { CourseContent } from "./_components/CourseContent";
import { Suspense } from "react";
import { LessonContentSkeleton } from "./_components/lessonSkeleton";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { getLessonContent } from "@/app/data/course/get-lesson-content";

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

  // Fetch initial data on server to prevent hydration mismatch
  const lessonData = await getLessonContent(lessonId);
  const initialLesson = lessonData && !(lessonData as any).status ? (lessonData as any).lesson : null;
  const initialVersion = (lessonData as any)?.version || null;

  return (
    <Suspense fallback={<LessonContentSkeleton />}>
      <CourseContent 
        lessonId={lessonId} 
        userId={user.id} 
        initialLesson={initialLesson} 
        initialVersion={initialVersion}
      />
    </Suspense>
  );
}
