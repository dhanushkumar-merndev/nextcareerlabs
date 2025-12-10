import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { CourseContent } from "./_components/CourseContent";

export default async function LessonContentPage({
  params,
}: {
  params: { lessonId: string };
}) {
  const { lessonId } = params;

  const data = await getLessonContent(lessonId);

  return <CourseContent data={data} />;
}
