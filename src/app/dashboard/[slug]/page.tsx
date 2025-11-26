import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";
import { redirect } from "next/navigation";

interface iAppProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}
export default async function CourseSulgPage({ params }: iAppProps) {
  const { slug } = await params;
  const course = await getCourseSidebarData(slug);
  const firstChapter = course.course.chapter[0];
  const firstLesson = firstChapter.lesson[0];

  if (firstLesson) {
    redirect(`/dashboard/${slug}/${firstLesson.id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <h2 className="text-2xl font-bold mb-2">No lessons Available</h2>
      <p className="text-muted-foreground">
        This course does not have any lessons yet.
      </p>
    </div>
  );
}
