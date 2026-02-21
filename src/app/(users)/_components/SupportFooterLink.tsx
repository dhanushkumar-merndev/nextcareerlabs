/* This component is used to display the support footer link */

"use client";
import { useState } from "react";
import { SupportTicketDialog } from "./SupportTicketDialog";
import { getEnrolledCoursesAction } from "@/app/data/notifications/actions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSmartSession } from "@/hooks/use-smart-session";

// Support footer link component
export function SupportFooterLink() {
  const [open, setOpen] = useState(false);
  const { session, isLoading: isPending } = useSmartSession();
  const isAuthenticated = !!session?.user?.id;
  const { data: enrolledCourses } = useQuery({
    queryKey: ["enrolledCourses"],
    queryFn: getEnrolledCoursesAction,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: open && isAuthenticated,
  });

  // Handle open
  const handleOpen = () => {
    if (isPending) return; // wait for auth to resolve
    if (!isAuthenticated) {
      toast.error("Please login to raise a support ticket.");
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {/* Support Footer Link */}
      <button onClick={handleOpen} className="hover:text-primary text-sm transition-colors text-left">Raise a Ticket</button>
      {/* Support Ticket Dialog */}
      <SupportTicketDialog open={open && isAuthenticated} onOpenChange={(nextOpen) => {
          if (nextOpen && !isAuthenticated) {
            toast.error("Please login to raise a support ticket.");
            return;
          }
          setOpen(nextOpen);
        }} courses={Array.isArray(enrolledCourses) ? enrolledCourses : []}/>
    </>
  );
}
