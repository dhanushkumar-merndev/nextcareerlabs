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
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAdminAnalytics,
  getAdminSuccessRate,
  getAdminStaticAnalytics,
} from "@/app/admin/analytics/actions";

import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { SimpleBarChart, SimplePieChart } from "@/components/analytics/Charts";
import { GrowthChartWithFilter } from "@/components/analytics/GrowthChartWithFilter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatIST } from "@/lib/utils";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { useRouter } from "next/navigation";

// Analytics Client Component
export function AnalyticsClient() {
  const router = useRouter();
  const isHydrated = typeof window !== "undefined";
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!hasLogged.current) {
      const keys = [
        { key: "admin_static_analytics", label: "Static" },
        { key: "admin_analytics_growth", label: "Growth" },
        { key: "admin_success_rate", label: "SuccessRate" },
      ];

      keys.forEach(({ key, label }) => {
        const cached = chatCache.get<Record<string, unknown>>(key);
        if (cached) {
          console.log(
            `%c[Analytics] LOCAL HIT (${label}). Rendering from device storage.`,
            "color: #eab308; font-weight: bold",
          );
        }
      });
      hasLogged.current = true;
    }

    // Cross-Tab Sync
    const handleStorageChange = (e: StorageEvent) => {
      const syncKeys = [
        "admin_analytics",
        "admin_static_analytics",
        "admin_analytics_growth",
        "admin_success_rate",
      ];
      if (syncKeys.some((key) => e.key?.includes(key))) {
        console.log(
          `[Analytics] Cross-Tab Sync: Updating dashboard via router.refresh()...`,
        );
        router.refresh(); // Server-side refresh
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [router]);

  // 1. Static Analytics (Counts, Distribution, Popular Courses, Recent Users)
  const { data: staticDataRaw, isLoading: isStaticLoading } = useQuery({
    queryKey: ["admin_static_analytics"],
    queryFn: async () => {
      const cached = chatCache.get<Record<string, unknown>>("admin_static_analytics");
      const result = await getAdminStaticAnalytics(cached?.version);

      if (result && "status" in result && result.status === "not-modified" && cached) {
        return cached.data;
      }

      if (result && "data" in result && result.data) {
        console.log(
          `%c[Analytics] SERVER HIT: NEW_DATA (Static). Syncing (v${result.version}).`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.set(
          "admin_static_analytics",
          result.data,
          undefined,
          result.version,
          PERMANENT_TTL,
        );
        return result.data;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<Record<string, unknown>>("admin_static_analytics")?.data;
    },
    staleTime: 1800000, // 30 mins
    refetchInterval: 1800000, // 30 mins
    refetchOnWindowFocus: false,
  });

type StaticAnalyticsData = {
  totalUsers: number;
  totalEnrollments: number;
  totalChapters: number;
  totalLessons: number;
  totalPdfs: number;
  totalImages: number;
  enrollmentChartData: Array<{ name: string; value: number }>;
  popularCoursesChartData: Array<{ name: string; value: number }>;
  recentUsers: Array<{ id: string; image?: string; name?: string; email?: string; createdAt: string }>;
};

type GrowthAnalyticsData = {
  chartData: Array<{ name: string; value: number }>;
};

  const staticData = staticDataRaw as StaticAnalyticsData | null;

  // 2. Growth Chart Data (Date-range filtered)
  const { data: growthDataRaw, isLoading: isGrowthLoading } = useQuery({
    queryKey: ["admin_analytics_growth"],
    queryFn: async () => {
      const cached = chatCache.get<Record<string, unknown>>("admin_analytics_growth");
      const result = await getAdminAnalytics(
        undefined,
        undefined,
        cached?.version,
      );

      if (result && "status" in result && result.status === "not-modified" && cached) {
        return cached.data;
      }

      if (result && "data" in result && result.data) {
        console.log(
          `%c[Analytics] SERVER HIT: NEW_DATA (Growth). Syncing (v${result.version}).`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.set(
          "admin_analytics_growth",
          result.data,
          undefined,
          result.version,
          PERMANENT_TTL,
        );
        return result.data;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<Record<string, unknown>>("admin_analytics_growth")?.data;
    },
    staleTime: 1800000, // 30 mins
    refetchOnWindowFocus: false,
  });

  const growthData = growthDataRaw as GrowthAnalyticsData | null;

  // 3. Success Rate Query (CPU Intensive calculation)
  const { data: successRateRaw, isLoading: isSuccessRateLoading } = useQuery({
    queryKey: ["admin_success_rate"],
    queryFn: async () => {
      const cached = chatCache.get<Record<string, unknown>>("admin_success_rate");
      const result = await getAdminSuccessRate();

      if (result) {
        console.log(
          `%c[Analytics] SERVER HIT: NEW_DATA (SuccessRate). Syncing (v${result.lastUpdated}).`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.set(
          "admin_success_rate",
          result,
          undefined,
          result.lastUpdated,
          PERMANENT_TTL,
        );
        return result;
      }
      return cached?.data || null;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<Record<string, unknown>>("admin_success_rate")?.data;
    },
    staleTime: 1800000,
    refetchInterval: 1800000,
    refetchOnWindowFocus: false,
    initialDataUpdatedAt: () => {
      if (typeof window === "undefined") return undefined;
      return chatCache.get<Record<string, unknown>>("admin_success_rate")?.timestamp;
    },
  });

  const successRate = successRateRaw as {
    value: number;
    lastUpdated: string;
  } | null;

  // Strict hydration guard
  if (!isHydrated || (isStaticLoading && !staticData) || (isGrowthLoading && !growthData)) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                <div className="h-3 w-32 bg-muted rounded animate-pulse mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
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
          value={
            isSuccessRateLoading && !successRate
              ? "Loading..."
              : `${successRate?.value ?? 0}%`
          }
          icon="play"
          description="Average lesson completion rate"
          lastUpdated={successRate?.lastUpdated}
        />
        <AnalyticsCard
          title="Shared Resources"
          value={`${staticData.totalPdfs} & ${staticData.totalImages}`}
          icon="file-text"
          description="Total PDF & Images shared in chats"
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
                    <TableHead className="min-w-[100px] hidden md:table-cell">
                      Joined
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staticData.recentUsers?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.image || ""} />
                            <AvatarFallback>
                              {user.name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {formatIST(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-[10px]"
                          asChild
                        >
                          <Link href={`/admin/analytics/users/${user.id}`}>
                            View
                          </Link>
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
