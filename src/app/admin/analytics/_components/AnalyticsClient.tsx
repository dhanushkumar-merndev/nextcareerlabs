"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getAdminAnalytics } from "@/app/admin/analytics/actions";
import { chatCache } from "@/lib/chat-cache";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { SimpleBarChart, SimplePieChart } from "@/components/analytics/Charts";
import { GrowthChartWithFilter } from "@/components/analytics/GrowthChartWithFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { LoadingAnalyticsBody } from "../loading";

export function AnalyticsClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["admin_analytics"],
    queryFn: async () => {
      const cached = chatCache.get<any>("admin_analytics");
      const clientVersion = cached?.version;

      console.log(`[Analytics] Syncing with server... (Client Version: ${clientVersion || 'None'})`);
      const result = await getAdminAnalytics(undefined, undefined, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        console.log(`[Analytics] Version matches. Keeping local data.`);
        return cached.data;
      }

      if (result && !(result as any).status) {
        console.log(`[Analytics] Received fresh analytics data.`);
        chatCache.set("admin_analytics", result, undefined, (result as any).version);
      }
      return result;
    },
    initialData: () => {
      const cached = chatCache.get<any>("admin_analytics");
      if (cached) {
        console.log(`[Analytics] Loaded cached data for admin dashboard`);
        return cached.data;
      }
      return undefined;
    },
    staleTime: 1800000, // 30 mins
    refetchOnWindowFocus: true,
  });

  if (!mounted || (isLoading && !data)) {
    return (
        <LoadingAnalyticsBody/>
    );
  }

  if (!data) return <div>Failed to load analytics.</div>;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <AnalyticsCard
          title="Users & Enrollments"
          value={data.totalUsers}
          icon="users"
          description={`Total registered users (${data.totalEnrollments} enrollments)`}
        />
        <AnalyticsCard
          title="Courses & Lessons"
          value={`${data.totalLessons}`}
          icon="book-text"
          description={`${data.totalCourses} Published courses`}
        />
        <AnalyticsCard
          title="Success Rate"
          value={`${data.averageProgress}%`}
          icon="play"
          description="Average lesson completion rate"
        />
        <AnalyticsCard
          title="Shared Resources"
          value={`${data.totalResources}`}
          icon="file-text"
          description="Total PDF & file uploads shared"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 md:col-span-2 lg:col-span-4">
          <GrowthChartWithFilter initialData={data.chartData} />
        </Card>
        <Card className="col-span-1 md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle>Enrollment Distribution</CardTitle>
            <CardDescription>Status of enrollments</CardDescription>
          </CardHeader>
          <CardContent>
            <SimplePieChart data={data.enrollmentChartData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>Popular Courses</CardTitle>
            <CardDescription>Top 5 courses by enrollment</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <SimpleBarChart data={data.popularCoursesChartData} />
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
                  {data.recentUsers?.map((user: any) => (
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
