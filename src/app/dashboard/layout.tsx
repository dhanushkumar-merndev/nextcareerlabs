import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./_components/DashboardAppSidebar";
import { SiteHeader } from "@/components/sidebar/site-header";
import { requireCompleteProfile } from "@/app/data/user/require-complete-profile";
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isComplete, user } = await requireCompleteProfile();
  
  const enrollmentCount = await prisma.enrollment.count({
    where: {
      userId: user.id,
      status: "Granted",
    },
  });
  
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <PhoneNumberDialog isOpen={!isComplete} />
      <AppSidebar variant="inset" isEnrolled={enrollmentCount > 0 || user.role === "admin"} />
      <SidebarInset className="overflow-hidden">
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="@container/main flex flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 overflow-hidden h-full">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
