/* This layout is used for auth pages */

import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Common layout for auth pages
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center">
      {/* Back Button */}
      <Link href="/" className={buttonVariants({variant: "outline",className: "absolute left-4 top-4 "})}>
        <ArrowLeft className="size-4" />
        Go Back
      </Link>
      {/* Auth Content */}
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
    </div>
  );
}
