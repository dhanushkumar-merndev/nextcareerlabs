import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";
import { CourseSidebar } from "../_components/CourseSidebar";

interface iAppProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export default async function CourseLayout({ children, params }: iAppProps) {
  const { slug } = await params;
  const course = await getCourseSidebarData(slug);

  return (
    <div className="flex flex-1 px-4 lg:px-6 ">
      {/* Side bar */}
      <div className="w-80 border-r border-border shrink-0">
        <CourseSidebar course={course.course} />
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
