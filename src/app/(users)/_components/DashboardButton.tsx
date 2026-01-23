"use client";

import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function DashboardButton() {
  const { data: session } = authClient.useSession();

  const dashboardHref =
    session?.user.role === "admin" ? "/admin" : "/dashboard";

  return (
    <Link
      className={buttonVariants({ size: "lg", variant: "outline" })}
      href={session ? dashboardHref : "/dashboard"}
    >
      {session ? "Goto Dashboard" : "Get Started"}
    </Link>
  );
}
