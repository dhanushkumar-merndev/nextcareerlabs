"use client";

import { useEffect, useRef } from "react";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useEnrolledCourses } from "@/hooks/use-enrolled-courses";
import { AppSidebar } from "./DashboardAppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/sidebar/site-header";

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <>
      <AppSidebar variant="inset" />

      <SidebarInset className="overflow-hidden">
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="@container/main flex flex-1 flex-col gap-2 overflow-hidden">
            <div className="flex flex-col gap-4 py-4 min-[1025px]:gap-6 min-[1025px]:py-6 overflow-hidden h-full">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
