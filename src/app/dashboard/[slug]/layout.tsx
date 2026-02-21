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

  // ✅ No server-side sidebar fetch here.
  // SidebarContainer handles the full 3-tier cache:
  //   🟡 localStorage (instant) → 🔵 Redis (30 min) → 🗄️ DB (on miss)
  // Fetching here would hit Redis on EVERY navigation with no benefit.
  return (
    <div className="px-4 lg:px-6 h-full flex flex-col flex-1">
      <SidebarContainer
        slug={slug}
        userId={user.id}
        initialCourseData={null}
        initialVersion={null}
      >
        {children}
      </SidebarContainer>
    </div>
  );
}
