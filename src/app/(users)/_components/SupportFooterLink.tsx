"use client";

import { useState } from "react";
import { SupportTicketDialog } from "./SupportTicketDialog";
import { getEnrolledCoursesAction } from "@/app/data/notifications/actions";
import { useQuery } from "@tanstack/react-query";

export function SupportFooterLink() {
  const [open, setOpen] = useState(false);

  const { data: enrolledCourses } = useQuery({
    queryKey: ["enrolledCourses"],
    queryFn: () => getEnrolledCoursesAction(),
    staleTime: 600000, // 10 mnutes
  });

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="hover:text-primary text-sm transition-colors text-left"
      >
      Raise a Ticket
      </button>
      <SupportTicketDialog 
        open={open} 
        onOpenChange={setOpen} 
        courses={Array.isArray(enrolledCourses) ? enrolledCourses : []} 
      />
    </>
  );
}
