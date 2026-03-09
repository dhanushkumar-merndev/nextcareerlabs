import { adminGetLesson } from "@/app/data/admin/admin-get-lesson";
import { LessonForm } from "./_components/LessonForm";

type Params = Promise<{
  courseId: string;
  chapterId: string;
  lessonId: string;
}>;

export default async function LessonIdPage({ params }: { params: Params }) {
  const { courseId, chapterId, lessonId } = await params;
  const lesson = await adminGetLesson(lessonId);

  return (
    <div className="py-2.5 md:py-5">
      <LessonForm data={lesson} chapterId={chapterId} courseId={courseId} />
    </div>
  );
}
