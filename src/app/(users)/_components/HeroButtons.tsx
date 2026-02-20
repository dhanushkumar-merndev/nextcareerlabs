"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useSmartSession } from "@/hooks/use-smart-session";

export default function HeroButtons() {
    const { session, isLoading } = useSmartSession();
    
    // Determine the dashboard link based on role
    const dashboardLink = session?.user?.role === "admin" ? "/admin" : "/dashboard";
    const dashboardLabel = session?.user?.role === "admin" ? "Go to Admin Dashboard" : "Go to Dashboard";

    return (
        <div className="flex flex-col gap-4 justify-center max-w-lg mx-auto pt-4 md:flex-row sm:justify-center">
            <Link
                href="/courses"
                className={buttonVariants({ size: "lg" })}
            >
                Explore Courses
            </Link>

            {isLoading ? (
                <div className={buttonVariants({ size: "lg", variant: "outline", className: "w-40 animate-pulse text-transparent bg-muted/50 border-none" })}>
                    Loading...
                </div>
            ) : session ? (
                <Link
                    href={dashboardLink}
                    className={buttonVariants({
                        size: "lg",
                        variant: "outline",
                    })}
                >
                    {dashboardLabel}
                </Link>
            ) : (
                <Link
                    href="/login"
                    className={buttonVariants({
                        size: "lg",
                        variant: "outline",
                    })}
                >
                    Get Started
                </Link>
            )}
        </div>
    );
}
