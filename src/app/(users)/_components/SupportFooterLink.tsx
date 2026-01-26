/* This component is used to display the support footer link */

"use client";
import { useState } from "react";
import { SupportTicketDialog } from "./SupportTicketDialog";
import { getEnrolledCoursesAction } from "@/app/data/notifications/actions";
import { useQuery } from "@tanstack/react-query";

export function SupportFooterLink() {
  const [open, setOpen] = useState(false);

  // Fetch enrolled courses only when dialog is open
  const { data: enrolledCourses } = useQuery({
    queryKey: ["enrolledCourses"],
    queryFn: getEnrolledCoursesAction,
    staleTime: 24 * 60 * 60 * 1000,
    enabled: open,
  });
  return (
    <>
      <button onClick={() => setOpen(true)} className="hover:text-primary text-sm transition-colors text-left">
      Raise a Ticket
      </button>
      <SupportTicketDialog open={open} onOpenChange={setOpen} courses={Array.isArray(enrolledCourses) ? enrolledCourses : []} />
    </>
  );
}
