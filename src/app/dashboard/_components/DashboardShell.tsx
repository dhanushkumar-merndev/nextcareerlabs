"use client";

import { useState, useEffect } from "react";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useEnrolledCourses } from "@/hooks/use-enrolled-courses";
import { AppSidebar } from "./DashboardAppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/sidebar/site-header";
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading: sessionLoading } = useSmartSession();

  const { isEnrolled } = useEnrolledCourses(
    session?.user?.id,
    sessionLoading
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isComplete = !!session?.user?.phoneNumber;

  return (
    <>
      {mounted && session && (
        <PhoneNumberDialog
          isOpen={!isComplete}
          requireName={!session.user.name}
        />
      )}

      <AppSidebar variant="inset" isEnrolled={isEnrolled} />

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
    </>
  );
}