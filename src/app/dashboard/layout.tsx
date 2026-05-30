import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardShell } from "./_components/DashboardShell";
import { requireUser } from "@/app/data/user/require-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

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
      <DashboardShell>
        {children}
      </DashboardShell>
    </SidebarProvider>
  );
}
