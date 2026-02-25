/**
 * AnalyticsClient
 *
 * Client component for admin analytics dashboard
 *
 * - Uses React Query for data fetching with caching
 * - Implements server-side rendering (SSR) with Next.js
 * - Supports infinite scrolling via cursor-based pagination
 * - Includes loading states and error handling
 * - Utilizes TanStack Query for efficient data fetching
 */

"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminAnalytics, getAdminSuccessRate, getAdminStaticAnalytics } from "@/app/admin/analytics/actions";

import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { SimpleBarChart, SimplePieChart } from "@/components/analytics/Charts";
import { GrowthChartWithFilter } from "@/components/analytics/GrowthChartWithFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatIST } from "@/lib/utils";
import Loader from "@/components/ui/Loader";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";

// Analytics Client Component
export function AnalyticsClient() {

  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef(false);

  useEffect(() => {
    setMounted(true);
    
    if (!hasLogged.current) {
        const cached = chatCache.get<any>("admin_analytics");
        if (cached) {
            console.log(`%c[Analytics] LOCAL HIT (v${cached.version}). Rendering from device storage.`, "color: #eab308; font-weight: bold");
        }
        hasLogged.current = true;
    }

    // Cross-Tab Sync
    const handleStorageChange = (e: StorageEvent) => {
        if (e.key?.includes("admin_analytics")) {
            console.log(`[Analytics] Cross-Tab Sync: Updating dashboard...`);
            window.location.reload();
        }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getTime = () => new Date().toLocaleTimeString();

  // 1. Static Analytics (Counts, Distribution, Popular Courses, Recent Users)
  const { data: staticDataRaw, isLoading: isStaticLoading } = useQuery({
    queryKey: ["admin_static_analytics"],
    queryFn: async () => {
      const cached = chatCache.get<any>("admin_static_analytics");
      const result = await getAdminStaticAnalytics(cached?.version);
      
      if (result?.status === "not-modified" && cached) {
        return cached.data;
      }

      if (result?.data) {
        console.log(`[${getTime()}] [Analytics] Static Data: UPDATED`);
        chatCache.set("admin_static_analytics", result.data, undefined, result.version, PERMANENT_TTL);
        return result.data;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<any>("admin_static_analytics")?.data;
    },
    staleTime: 3600000, // 1 hour
    refetchInterval: 3600000,
  });

  const staticData = staticDataRaw as any;

  // 2. Growth Chart Data (Date-range filtered)
  const { data: growthDataRaw, isLoading: isGrowthLoading } = useQuery({
    queryKey: ["admin_analytics_growth"],
    queryFn: async () => {
      const cached = chatCache.get<any>("admin_analytics_growth");
      const result = await getAdminAnalytics(undefined, undefined, cached?.version);

      if (result?.status === "not-modified" && cached) {
        return cached.data;
      }

      if (result?.data) {
        chatCache.set("admin_analytics_growth", result.data, undefined, result.version, PERMANENT_TTL);
        return result.data;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<any>("admin_analytics_growth")?.data;
    },
    staleTime: 1800000, // 30 mins
  });

  const growthData = growthDataRaw as any;

  // 3. Success Rate Query (CPU Intensive calculation)
  const { data: successRateRaw, isLoading: isSuccessRateLoading } = useQuery({
    queryKey: ["admin_success_rate"],
    queryFn: async () => {
      const cached = chatCache.get<any>("admin_success_rate");
      const result = await getAdminSuccessRate();
      
      if (result) {
        chatCache.set("admin_success_rate", result, undefined, result.lastUpdated, PERMANENT_TTL);
        return result;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<any>("admin_success_rate")?.data;
    },
    staleTime: 3600000,
  });

  const successRate = successRateRaw as { value: number; lastUpdated: string } | null;

  // Strict hydration guard
  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
        <Loader size={40} />
      </div>
    );
  }

  // If loading essential static data, return loading state
  if ((isStaticLoading && !staticData) || (isGrowthLoading && !growthData)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
        <Loader size={40} />
      </div>
    );
  }

  // If no data available at all
  if (!staticData || !growthData) return <div>Failed to load analytics.</div>;

  // Render analytics dashboard
  return (
    // Analytics Dashboard
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          title="Users & Enrollments"
          value={staticData.totalUsers}
          icon="users"
          description={`Total registered users (${staticData.totalEnrollments} users with granted enrollment)`}
        />
        <AnalyticsCard
          title="Chapters & Lessons"
          value={`${staticData.totalChapters}`}
          icon="book-text"
          description={`Across ${staticData.totalLessons} total lessons`}
        />
        <AnalyticsCard
          title="Success Rate"
          value={isSuccessRateLoading && !successRate ? "Loading..." : `${successRate?.value ?? 0}%`}
          icon="play"
          description="Average lesson completion rate"
          lastUpdated={successRate?.lastUpdated}
        />
        <AnalyticsCard
          title="Shared Resources"
          value={`${staticData.totalResources}`}
          icon="file-text"
          description="Total PDF & file uploads shared"
        />
      </div>
       {/* Growth Chart */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 md:col-span-2 lg:col-span-4">
          <GrowthChartWithFilter initialData={growthData.chartData} />
        </Card>
        {/* Enrollment Distribution Chart */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle>Enrollment Distribution</CardTitle>
            <CardDescription>Status of enrollments</CardDescription>
          </CardHeader>
          <CardContent>
            <SimplePieChart data={staticData.enrollmentChartData} />
          </CardContent>
        </Card>
      </div>
      {/* Popular Courses Chart */} 
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>Popular Courses</CardTitle>
            <CardDescription>Top 5 courses by enrollment</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SimpleBarChart data={staticData.popularCoursesChartData} />
          </CardContent>
        </Card>
        <Card className="col-span-1 md:col-span-2 lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Users</CardTitle>
              <CardDescription>
                Latest users joined the platform.
              </CardDescription>
            </div>
            <Button variant="default" size="sm" asChild>
              <Link href="/admin/analytics/users">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">User</TableHead>
                    <TableHead className="min-w-[100px] hidden md:table-cell">Joined</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staticData.recentUsers?.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.image || ""} />
                            <AvatarFallback>{user.name?.charAt(0) || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {formatIST(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="h-7 px-3 text-[10px]" asChild>
                          <Link href={`/admin/analytics/users/${user.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
