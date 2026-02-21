"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useSmartSession } from "@/hooks/use-smart-session";

export default function HeroButtons() {
    const { session, isLoading } = useSmartSession();
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    // Determine the dashboard link based on role
    const dashboardLink = session?.user?.role === "admin" ? "/admin" : "/dashboard";
    const dashboardLabel = session?.user?.role === "admin" ? "Go to Admin Dashboard" : "Go to Dashboard";

    return (
        <div className="flex flex-col items-center gap-4 justify-center max-w-lg mx-auto pt-4 md:flex-row sm:justify-center">
            <Link
                href="/courses"
                className={buttonVariants({ size: "lg", className: "w-48" })}
            >
                Explore Courses
            </Link>

            {!mounted || isLoading ? (
                <div className={buttonVariants({ size: "lg", variant: "outline", className: "w-48 animate-pulse text-transparent bg-muted/20 border-border/10" })}>
                    Loading...
                </div>
            ) : session ? (
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
