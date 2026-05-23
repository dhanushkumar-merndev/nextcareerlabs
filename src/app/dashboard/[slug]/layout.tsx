import { SidebarContainer } from "../_components/SidebarContainer";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";

interface iAppProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export default async function CourseLayout({ children, params }: iAppProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { slug } = await params;

  const sidebarResult = await getCourseSidebarData(slug);
  const initialCourseData = sidebarResult && "course" in sidebarResult ? sidebarResult.course : null;
  const initialVersion = sidebarResult && "version" in sidebarResult ? sidebarResult.version : null;

  return (
    <div className="px-4 min-[1025px]:px-6 h-full flex flex-col flex-1">
      <SidebarContainer
        slug={slug}
        userId={user.id}
        initialCourseData={initialCourseData}
        initialVersion={initialVersion}
      >
        {children}
      </SidebarContainer>
    </div>
  );
}
