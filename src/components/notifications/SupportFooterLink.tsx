"use client";

import { useState } from "react";
import { SupportTicketDialog } from "./SupportTicketDialog";

export function SupportFooterLink({ courses }: { courses: { id: string, title: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="hover:text-primary text-sm transition-colors text-left"
      >
        Reach Out / Raise a Ticket
      </button>
      <SupportTicketDialog open={open} onOpenChange={setOpen} courses={courses} />
    </>
  );
}
