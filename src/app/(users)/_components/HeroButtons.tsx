/* This component is used to navigate to user dashboard or admin dashboard based on role */

"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useSmartSession } from "@/hooks/use-smart-session";

export default function HeroButtons() {
    const { session } = useSmartSession();
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []); // eslint-disable-line react-hooks/set-state-in-effect

    // Determine the dashboard link based on role
    const dashboardLink = session?.user?.role === "admin" ? "/admin" : "/dashboard";
    const dashboardLabel = session?.user?.role === "admin" ? "Go to Admin Dashboard" : "Go to Dashboard";

    // Always show "Get Started" during SSR to match server HTML
    const showDashboard = mounted && !!session;

    return (
        <div className="flex flex-col items-center gap-4 justify-center max-w-lg mx-auto pt-4 md:flex-row sm:justify-center">
            <Link
                href="/courses"
                className={buttonVariants({ size: "lg", className: "w-48" })}
            >
                Explore Courses
            </Link>

            {showDashboard ? (
                <Link
                    href={dashboardLink}
                    className={buttonVariants({
                        size: "lg",
                        variant: "outline",
                        className: "w-48"
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
                        className: "w-48"
                    })}
                >
                    Get Started
                </Link>
            )}
        </div>
    );
}
