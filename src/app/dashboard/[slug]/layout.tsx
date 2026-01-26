import { getCourseSidebarData } from "@/app/data/course/get-course-sidebar-data";
import { SidebarContainer } from "../_components/SidebarContainer";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

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

  return (
    <div className="px-4 lg:px-6 h-full flex flex-col flex-1">
      <SidebarContainer slug={slug} userId={user.id}>{children}</SidebarContainer>
    </div>
  );
}
