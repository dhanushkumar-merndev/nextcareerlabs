import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardShell } from "./_components/DashboardShell";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
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
