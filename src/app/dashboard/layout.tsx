import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardShell } from "./_components/DashboardShell";
import { cookies } from "next/headers";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isEnrolledHeader = cookieStore.get("is_enrolled")?.value === "true";

  return (
    <SidebarProvider
      overlap={false}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <DashboardShell isEnrolledHint={isEnrolledHeader}>
        {children}
      </DashboardShell>
    </SidebarProvider>
  );
}
