"use client";

import { useQuery } from "@tanstack/react-query";
import { 
    adminGetDashboardDataAction,
} from "../actions";

import { SectionCards } from "@/components/sidebar/section-cards";
import { ChartAreaInteractive } from "@/components/sidebar/chart-area-interactive";
import { AdminCourseCard } from "../courses/_components/AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRefreshRateLimit } from "@/hooks/use-refresh-rate-limit";


export function AdminDashboardClient() {
    const [mounted, setMounted] = useState(false);
    const hasLogged = useRef(false);
    
    useEffect(() => {
        setMounted(true);
        
        if (!hasLogged.current) {
            const cached = chatCache.get<any>("admin_dashboard_all");
            if (cached) {
                let statsV = "0";
                if (cached?.version) {
                    try { statsV = JSON.parse(cached.version).stats; } catch(e) {}
                }
                console.log(`%c[AdminDashboard] LOCAL HIT (vStats:${statsV}). Rendering from storage.`, "color: #eab308; font-weight: bold");
            }
            hasLogged.current = true;
        }

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
    const { data: dashboardData, isLoading, refetch } = useQuery({
        queryKey: ["admin_dashboard_all"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_dashboard_all");
            let clientVersions: any;
            if (cached?.version) {
                try { clientVersions = JSON.parse(cached.version); } catch(e) {}
            }

            if (!cached) console.log(`[${getTime()}] [Dashboard] Cache MISS. Fetching all...`);

            const result = await adminGetDashboardDataAction(clientVersions);

            if (result && (result as any).status === "not-modified") {
                console.log(`[${getTime()}] [Dashboard] Server: Not Modified. Using local cache.`);
                return cached?.data;
            }

            if (result && (result as any).data) {
                console.log(`[${getTime()}] [Dashboard] Result received. Updating cache.`);
                // Store serialized versions in the single 'version' slot
                chatCache.set("admin_dashboard_all", result.data, undefined, JSON.stringify(result.versions), PERMANENT_TTL); 
                return result.data;
            }
            return cached?.data || null;
        },
        initialData: () => {
            if (typeof window === "undefined") return undefined;
            const cached = chatCache.get<any>("admin_dashboard_all");
            return cached?.data;
        },
        initialDataUpdatedAt: typeof window !== "undefined"
          ? chatCache.get<any>("admin_dashboard_all")?.timestamp
          : undefined,
        staleTime: 1800000, 
        refetchInterval: 1800000, 
        refetchOnWindowFocus: true,
    });

    const [isRefreshing, setIsRefreshing] = useState(false);
    const { checkRateLimit } = useRefreshRateLimit(5, 60000);


    const handleManualRefresh = async () => {
        if (!checkRateLimit()) return;
        setIsRefreshing(true);

        try {
            await Promise.all([
                refetch(),
                // Add a small delay for visual feedback if query is too fast
                new Promise(resolve => setTimeout(resolve, 800))
            ]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const statsData = mounted ? dashboardData?.stats : undefined;
    const enrollmentsData = mounted ? dashboardData?.enrollments : undefined;
    const coursesData = mounted ? dashboardData?.recentCourses : undefined;

    const showStatsSkeleton = !mounted || (isLoading && !statsData);
    const isInteractionDisabled = !mounted || isRefreshing || isLoading;


    return (
        <div className="lg:py-5 md:py-6">
            <div className="flex items-center justify-between px-4 lg:px-6 mb-4 md:mb-6">
                <h2 className="text-xl font-semibold">Dashboard Overview</h2>
                <div className="flex items-center gap-3">


                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 rounded-xl border-border/40 bg-card/40 backdrop-blur-sm hover:bg-muted/50 transition-all font-bold uppercase tracking-widest text-[10px] h-9"
                        onClick={handleManualRefresh}
                        disabled={isInteractionDisabled}
                    >
                        <RefreshCw className={cn("size-3", (mounted && (isRefreshing || isLoading)) && "animate-spin text-primary")} />
                        {mounted ? (isRefreshing ? "Checking Versions..." : "Check for Updates") : "Checking Updates..."}
                    </Button>
                </div>

            </div>

            {showStatsSkeleton ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 ">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
            ) : (

                <SectionCards stats={statsData} />
            )}

            <div className="px-4 lg:px-6 py-6">
                {(!mounted || (isLoading && !enrollmentsData)) ? (
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

                    {(!mounted || (isLoading && !coursesData)) ? (
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
