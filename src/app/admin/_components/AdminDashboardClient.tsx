"use client";

import { useQuery } from "@tanstack/react-query";
import { 
    adminGetDashboardStatsAction, 
    adminGetEnrollmentsStatsAction, 
    adminGetRecentCoursesAction 
} from "../actions";
import { chatCache } from "@/lib/chat-cache";
import { SectionCards } from "@/components/sidebar/section-cards";
import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";
import { AdminCourseCard } from "../courses/_components/AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminDashboardClientProps {
    initialStats?: any;
    initialEnrollments?: any;
    initialRecentCourses?: any;
}

export function AdminDashboardClient({ 
    initialStats, 
    initialEnrollments, 
    initialRecentCourses 
}: AdminDashboardClientProps) {

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // 1. Stats Query
    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ["admin_dashboard_stats"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_stats");
            const clientVersion = cached?.version;
            const result = await adminGetDashboardStatsAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data;
            }

            if (!(result as any).status) {
                chatCache.set("admin_dashboard_stats", result.stats, undefined, result.version);
                return result.stats;
            }
            return result.stats;
        },
        initialData: () => {
            if (initialStats) return initialStats.stats;
            if (typeof window === "undefined") return undefined;
            return chatCache.get<any>("admin_dashboard_stats")?.data;
        },

        staleTime: 600000, // 10 mins
    });

    // 2. Enrollments Query
    const { data: enrollmentsData, isLoading: enrollmentsLoading } = useQuery({
        queryKey: ["admin_dashboard_enrollments"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_enrollments");
            const clientVersion = cached?.version;
            const result = await adminGetEnrollmentsStatsAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data;
            }

            if (!(result as any).status) {
                chatCache.set("admin_dashboard_enrollments", result.data, undefined, result.version);
                return result.data;
            }
            return result.data;
        },
        initialData: () => {
            if (initialEnrollments) return initialEnrollments.data;
            if (typeof window === "undefined") return undefined;
            return chatCache.get<any>("admin_dashboard_enrollments")?.data;
        },

        staleTime: 600000,
    });

    // 3. Recent Courses Query
    const { data: coursesData, isLoading: coursesLoading } = useQuery({
        queryKey: ["admin_dashboard_recent_courses"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_recent_courses");
            const clientVersion = cached?.version;
            const result = await adminGetRecentCoursesAction(clientVersion);

            if ((result as any).status === "not-modified" && cached) {
                return cached.data;
            }

            if (!(result as any).status) {
                chatCache.set("admin_dashboard_recent_courses", result.courses, undefined, result.version);
                return result.courses;
            }
            return result.courses;
        },
        initialData: () => {
            if (initialRecentCourses) return initialRecentCourses.courses;
            if (typeof window === "undefined") return undefined;
            return chatCache.get<any>("admin_dashboard_recent_courses")?.data;
        },

        staleTime: 600000,
    });


    return (
        <div className="lg:py-5 md:py-6">
            {(statsLoading && !statsData) || (!mounted && !initialStats) ? (

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 ">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
            ) : (
                <SectionCards stats={statsData} />
            )}

            <div className="px-4 lg:px-6 py-6">
                {(enrollmentsLoading && !enrollmentsData) || (!mounted && !initialEnrollments) ? (

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

                    {(coursesLoading && !coursesData) || (!mounted && !initialRecentCourses) ? (

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
