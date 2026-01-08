"use client";

import { useState } from "react";
import { SupportTicketDialog } from "./SupportTicketDialog";
import { getEnrolledCoursesAction } from "@/app/data/notifications/actions";
import { useQuery } from "@tanstack/react-query";

export function SupportFooterLink({ courses: initialCourses }: { courses: { id: string, title: string }[] }) {
  const [open, setOpen] = useState(false);

  const { data: enrolledCourses } = useQuery({
    queryKey: ["enrolledCourses"],
    queryFn: () => getEnrolledCoursesAction(),
    staleTime: 600000, // 10 minutes
  });

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="hover:text-primary text-sm transition-colors text-left"
      >
        Reach Out / Raise a Ticket
      </button>
      <SupportTicketDialog 
        open={open} 
        onOpenChange={setOpen} 
        courses={Array.isArray(enrolledCourses) ? enrolledCourses : []} 
      />
    </>
  );
}
