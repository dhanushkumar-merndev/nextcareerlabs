"use client";

import { useQuery } from "@tanstack/react-query";
import { 
    adminGetDashboardStatsAction, 
    adminGetEnrollmentsStatsAction, 
    adminGetRecentCoursesAction 
} from "../actions";

import { SectionCards } from "@/components/sidebar/section-cards";
import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";
import { AdminCourseCard } from "../courses/_components/AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { chatCache } from "@/lib/chat-cache";

export function AdminDashboardClient() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);

        // 🟢 Robust LOCAL HIT Logging for Console
        const statsCached = chatCache.get<any>("admin_dashboard_stats");
        const enrollCached = chatCache.get<any>("admin_dashboard_enrollments");
        const coursesCached = chatCache.get<any>("admin_dashboard_recent_courses");

        if (statsCached) console.log(`[AdminDashboard] LOCAL HIT (v${statsCached.version}). Rendering from device storage.`);
        if (enrollCached) console.log(`[AdminDashboard] [Enrollments] LOCAL HIT (v${enrollCached.version}). Rendering from device storage.`);
        if (coursesCached) console.log(`[AdminDashboard] [RecentCourses] LOCAL HIT (v${coursesCached.version}). Rendering from device storage.`);

        // Cross-Tab Sync: Listen for storage changes from other tabs
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key?.includes("admin_dashboard_stats") || 
                e.key?.includes("admin_dashboard_enrollments") || 
                e.key?.includes("admin_dashboard_recent_courses")) {
                console.log(`[Dashboard] Cross-Tab Sync: LocalStorage updated from another tab. Fetching...`);
                // Trigger React Query refetch
                window.location.reload(); // Simple approach for dashboard to stay perfectly aligned
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const getTime = () => new Date().toLocaleTimeString();

    // 1. Stats Query
    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ["admin_dashboard_stats"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_stats");
            const clientVersion = cached?.version;

            if (!cached) {
                 console.log(`[Dashboard] Cache MISS. Fetching...`);
            }

            const result = await adminGetDashboardStatsAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data || null;
            }

            if (result && !(result as any).status && (result as any).data) {
                console.log(`[${getTime()}] [Dashboard] Result: NEW_DATA. Updating cache.`);
                chatCache.set("admin_dashboard_stats", result.data, undefined, result.version, 2592000000); // 30 Days
                return result.data;
            }
            return (result as any)?.data || cached?.data || null;
        },
        initialData: () => {
            if (typeof window === "undefined") return undefined;
            const cached = chatCache.get<any>("admin_dashboard_stats");
            if (cached) {
                return cached.data;
            }
            return undefined;
        },
        staleTime: 1800000, 
        refetchInterval: 1800000, 
        refetchOnWindowFocus: true,
    });

    // 2. Enrollments Query
    const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
        queryKey: ["admin_dashboard_enrollments"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_enrollments");
            const clientVersion = cached?.version;

            if (!cached) {
                console.log(`[${getTime()}] [Enrollments] Cache MISS. Fetching...`);
            }

            const result = await adminGetEnrollmentsStatsAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data || null;
            }

            if (result && !(result as any).status && (result as any).data) {
                console.log(`[${getTime()}] [Enrollments] Result: NEW_DATA. Updating cache.`);
                chatCache.set("admin_dashboard_enrollments", result.data, undefined, result.version, 2592000000); // 30 Days
                return result.data;
            }
            return (result as any)?.data || cached?.data || null;
        },
        initialData: () => {
             if (typeof window === "undefined") return undefined;
             const cached = chatCache.get<any>("admin_dashboard_enrollments");
             if (cached) {
                 return cached.data;
             }
             return undefined;
        },
        staleTime: 1800000,
        refetchInterval: 1800000,
        refetchOnWindowFocus: true,
    });

    // 3. Recent Courses Query
    const { data: coursesData, isLoading: coursesLoading } = useQuery({
        queryKey: ["admin_dashboard_recent_courses"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_recent_courses");
            const clientVersion = cached?.version;

            if (!cached) {
                console.log(`[${getTime()}] [RecentCourses] Cache MISS. Fetching...`);
            }

            const result = await adminGetRecentCoursesAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data || null;
            }

            if (result && !(result as any).status && (result as any).data) {
                console.log(`[${getTime()}] [RecentCourses] Result: NEW_DATA. Updating cache.`);
                chatCache.set("admin_dashboard_recent_courses", result.data, undefined, result.version, 2592000000); // 30 Days
                return result.data;
            }
            return (result as any)?.data || cached?.data || null;
        },
        initialData: () => {
             if (typeof window === "undefined") return undefined;
             const cached = chatCache.get<any>("admin_dashboard_recent_courses");
             if (cached) {
                 return cached.data;
             }
             return undefined;
        },
        staleTime: 1800000,
        refetchInterval: 1800000,
        refetchOnWindowFocus: true,
    });

    // Hydration guard: ensures server and client render the same skeletons initially
    if (!mounted) {
        return (
            <div className="lg:py-5 md:py-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 ">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
                <div className="px-4 lg:px-6 py-6">
                    <Skeleton className="h-[400px] w-full rounded-xl mb-6" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-video w-full rounded-xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="lg:py-5 md:py-6">
            {(statsLoading && !statsData) ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 ">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
            ) : (
                <SectionCards stats={statsData} />
            )}

            <div className="px-4 lg:px-6 py-6">
                {(enrollmentsLoading && !enrollmentsData) ? (
                    <Skeleton className="h-[400px] w-full rounded-xl mb-6" />
                ) : (
                    <ChartAreaInteractive data={enrollmentsData || []} />
                )}

                <div className="space-y-4 mt-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Recent Courses</h2>
                        <Link
                            href="/admin/courses"
                            className={buttonVariants({ variant: "outline" })}
                        >
                            View All Courses
                        </Link>
                    </div>

                    {(coursesLoading && !coursesData) ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                           {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-video w-full rounded-xl" />)}
                        </div>
                    ) : coursesData?.length === 0 ? (
                        <EmptyState
                            buttonText="Create New Course"
                            description="No recent courses found."
                            title="You don't have any courses yet. Please create one."
                            href="/admin/courses/create"
                        />
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {coursesData?.map((course: any) => (
                                <AdminCourseCard key={course.id} data={course} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
