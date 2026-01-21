import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";
import { SidebarContainer } from "../_components/SidebarContainer";

interface iAppProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export default async function CourseLayout({ children, params }: iAppProps) {
  const { slug } = await params;
  const courseData = await getCourseSidebarData(slug);

  return (
    <div className="px-4 lg:px-6 h-full flex flex-col flex-1">
      <SidebarContainer course={courseData.course}>{children}</SidebarContainer>
    </div>
  );
}
