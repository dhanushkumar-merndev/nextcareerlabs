/* This component is used to navigate to the dashboard */

"use client";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useSmartSession } from "@/hooks/use-smart-session";

// This component is used to navigate to the dashboard or admin dashboard based on the user role
export function DashboardButton() {
  // Get session data
  const { session } = useSmartSession();

  // Get dashboard href based on user role
  const dashboardHref =
    session?.user.role === "admin" ? "/admin" : "/dashboard";

  return (
    /* Dashboard Button */
    <Link className={buttonVariants({ size: "lg", variant: "outline" })} href={session ? dashboardHref : "/dashboard"}>
      {session ? "Goto Dashboard" : "Get Started"}
    </Link>
  );
}
