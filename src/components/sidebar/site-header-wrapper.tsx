import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ThemeToggleClient from "./ThemeToggleClient";
import { ThemeToggle } from "../ui/themeToggle";
import { NotificationCenter } from "../notifications/NotificationCenter";

export function SiteHeaderWrapper() {
  const isClient = typeof window !== "undefined";

  return (
    <header className="flex h-[--header-height] shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-[--header-height]">
      <div className="flex w-full items-center gap-1 px-4 py-1.5 lg:gap-2 lg:px-6">
        {/* LEFT SIDE — Sidebar Trigger + Title */}
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="text-base font-medium">Next Career Labs LMS</h1>
        </div>

        {/* RIGHT SIDE — Theme Toggle & Notifications */}
        <div className="ml-auto flex items-center gap-2">
          <NotificationCenter />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
