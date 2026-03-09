"use client";

import { useState, useEffect } from "react";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useEnrolledCourses } from "@/hooks/use-enrolled-courses";
import { AppSidebar } from "./DashboardAppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/sidebar/site-header";
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";

export function DashboardShell({
  children,
  isEnrolledHint,
}: {
  children: React.ReactNode;
  isEnrolledHint?: boolean;
}) {
  const { session, isLoading: sessionLoading } = useSmartSession();

  const { data: enrolledCourses, isLoading: enrolledLoading } =
    useEnrolledCourses(session?.user?.id, sessionLoading);

  // HYDRATION FIX: Use state initialized from server hint to ensure initial render match
  const [isEnrolled, setIsEnrolled] = useState(isEnrolledHint ?? false);
  const [mounted, setMounted] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state after mount
  useEffect(() => {
    if (mounted && enrolledCourses !== undefined) {
      const actualEnrollment = enrolledCourses.length > 0;
      if (actualEnrollment !== isEnrolled) {
        setIsEnrolled(actualEnrollment);

        // PERSISTENCE FIX: Sync the cookie from the client too
        if (typeof document !== "undefined") {
          document.cookie = `is_enrolled=${actualEnrollment}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
        }
      }
    }
  }, [mounted, enrolledCourses, enrolledLoading, isEnrolled]);

  const isComplete = !!session?.user?.phoneNumber;

  return (
    <>
      {mounted && session && !hasSubmitted && (
        <PhoneNumberDialog
          isOpen={!isComplete}
          requireName={!session.user.name}
          onSuccess={() => setHasSubmitted(true)}
        />
      )}

      <AppSidebar variant="inset" isEnrolled={isEnrolled} />

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
