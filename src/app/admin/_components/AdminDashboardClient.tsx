"use client";

import { useQuery } from "@tanstack/react-query";
import { 
    adminGetDashboardDataAction
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

        const cached = chatCache.get<any>("admin_dashboard_all");
        let statsV = "0";
        if (cached?.version) {
            try { statsV = JSON.parse(cached.version).stats; } catch(e) {}
        }
        if (cached) console.log(`[AdminDashboard] LOCAL HIT (vStats:${statsV}). Rendering consolidated data.`);

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key?.includes("admin_dashboard_all")) {
                console.log(`[Dashboard] Cross-Tab Sync: LocalStorage updated. Refreshing...`);
                window.location.reload();
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const getTime = () => new Date().toLocaleTimeString();

    // Consolidated Data Query
    const { data: dashboardData, isLoading } = useQuery({
        queryKey: ["admin_dashboard_all"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_all");
            let clientVersions: any;
            if (cached?.version) {
                try { clientVersions = JSON.parse(cached.version); } catch(e) {}
            }

            if (!cached) console.log(`[${getTime()}] [Dashboard] Cache MISS. Fetching all...`);

            const result = await adminGetDashboardDataAction(clientVersions);

            if (result && (result as any).data) {
                console.log(`[${getTime()}] [Dashboard] Result received. Updating cache.`);
                // Store serialized versions in the single 'version' slot
                chatCache.set("admin_dashboard_all", result.data, undefined, JSON.stringify(result.versions), 2592000000); 
                return result.data;
            }
            return cached?.data || null;
        },
        initialData: () => {
            if (typeof window === "undefined") return undefined;
            const cached = chatCache.get<any>("admin_dashboard_all");
            return cached?.data;
        },
        staleTime: 1800000, 
        refetchInterval: 1800000, 
        refetchOnWindowFocus: true,
    });

    const statsData = dashboardData?.stats;
    const enrollmentsData = dashboardData?.enrollments;
    const coursesData = dashboardData?.recentCourses;

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
            {(isLoading && !statsData) ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 ">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
            ) : (
                <SectionCards stats={statsData} />
            )}

            <div className="px-4 lg:px-6 py-6">
                {(isLoading && !enrollmentsData) ? (
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

                    {(isLoading && !coursesData) ? (
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
