"use client";
import * as React from "react";
import {
  IconCamera,
  IconLayoutDashboard,
  IconBook,
  IconLibrary,
  IconFileAi,
  IconFileDescription,
  IconHelp,
  IconSearch,
  IconSettings,
  IconMessages,
} from "@tabler/icons-react";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavSecondary } from "@/components/sidebar/nav-secondary";
import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconLayoutDashboard,
    },
    {
      title: "My Courses",
      url: "/dashboard/my-courses",
      icon: IconBook,
    },
    {
      title: "Resources",
      url: "/dashboard/resources",
      icon: IconMessages,
    },
    {
      title: "Available Courses",
      url: "/dashboard/available-courses",
      icon: IconLibrary,
    },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: IconCamera,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: IconFileDescription,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: IconFileAi,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
  navSecondary: [


  ],
};

export function AppSidebar({ isEnrolled, ...props }: React.ComponentProps<typeof Sidebar> & { isEnrolled: boolean }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isMounted, setIsMounted] = React.useState(false);
  
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleLogoClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const filteredNavMain = data.navMain.map(item => {
      // Logic to keep "My Courses" active when viewing a specific course (e.g. /dashboard/salesforce)
      // but NOT when viewing other main sections like /dashboard/resources, /dashboard/available-courses
      if (item.title === "My Courses") {
          const isCoursePage = pathname.startsWith("/dashboard/") && 
             pathname !== "/dashboard" &&
             pathname !== "/dashboard/available-courses" && 
             pathname !== "/dashboard/resources" &&
             pathname !== "/dashboard/my-courses"; // my-courses handled by strict match usually, but good to include context? No, strictly strictly.
          
          if (isCoursePage || pathname === item.url) {
              return { ...item, isActive: true };
          }
      }
      return { ...item, isActive: pathname === item.url };
  }).filter(item => {
    if (item.title === "Resources") return isMounted ? isEnrolled : false;
    return true;
  });

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/" onClick={handleLogoClick}>
                <Logo className="w-10 h-10" />

                <span className="text-base font-semibold ml-1">
                  Skill Force Cloud LMS
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={filteredNavMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
