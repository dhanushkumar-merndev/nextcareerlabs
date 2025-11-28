"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { CourseSidebar } from "./CourseSidebar";
import { CourseSidebarDataType } from "@/app/data/course/get-course-sidebar-data";

export function SidebarContainer({
  course,
  children,
}: {
  course: CourseSidebarDataType["course"];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // -------------------------------------------------
  // 🚫 Disable background scroll when sidebar is open (MOBILE ONLY)
  // -------------------------------------------------
  useEffect(() => {
    const isMobile = window.innerWidth < 768;

    if (isMobile && open) {
      document.body.style.overflow = "hidden"; // lock scroll
    } else {
      document.body.style.overflow = ""; // unlock scroll
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex flex-col h-full">
      {/* MOBILE HEADER */}
      <div className="md:hidden flex items-center justify-between pb-4 bg-background shadow-sm">
        <h2></h2>

        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg border hover:bg-accent transition"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-1">
        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:block w-80 border-r border-border shrink-0 bg-background/50 backdrop-blur-sm">
          <CourseSidebar course={course} />
        </div>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>

      {/* MOBILE BACKDROP */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
        />
      )}

      {/* MOBILE SLIDE-IN SIDEBAR */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-background border-r border-border shadow-xl z-50 transform transition-transform duration-300 md:hidden
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background/70 backdrop-blur-sm shadow-sm">
          <h3></h3>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-accent transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="overflow-y-auto h-full pt-6 pl-3 custom-scrollbar">
          <CourseSidebar course={course} />
        </div>
      </div>
    </div>
  );
}
