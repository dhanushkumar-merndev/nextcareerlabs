"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BackConfirm } from "./BackConfirm";
import { EditCourseForm } from "./EditCourseForm";
import { CourseStructure } from "./CourseStructure";
import { useQuery } from "@tanstack/react-query";
import { adminGetCourseAction } from "../actions";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { EditCourseSkeleton } from "./EditCourseSkeleton";
import type { AdminCourseSingularData, AdminCourseSingularType } from "@/app/data/admin/admin-get-course";

interface EditCourseClientWrapperProps {
  courseId: string;
}

export function EditCourseClientWrapper({
  courseId,
}: EditCourseClientWrapperProps) {
  const [basicDirty, setBasicDirty] = useState(false);
  const [structureDirty, setStructureDirty] = useState(false);

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "basic-info",
  );
  const cacheKey = `admin_course_${courseId}`;

  const { data } = useQuery<AdminCourseSingularData>({
    queryKey: [cacheKey],
    queryFn: async () => {
      const cached = chatCache.get<AdminCourseSingularData>(cacheKey);

      const result: AdminCourseSingularType = await adminGetCourseAction(courseId, cached?.version);

      if (result.status === "not-modified" && cached) {
        console.log(
          `%c[EditCourse] ✨ LOCAL HIT (Smart Sync Match) (v${cached.version})`,
          "color: #eab308; font-weight: bold",
        );
        return cached.data;
      }

      const freshData = result.data!;
      const source = result.source;
      const computeTime = result.computeTime;

      if (source === "REDIS") {
        console.log(
          `%c[EditCourse] 🔵 REDIS HIT → course:${courseId} (v${result.version})`,
          "color: #3b82f6; font-weight: bold",
        );
      } else if (source === "DB") {
        console.log(
          `%c[EditCourse] 🗄️ DB COMPUTE → course:${courseId} done in ${computeTime}ms`,
          "color: #f97316; font-weight: bold",
        );
      }

      chatCache.set(cacheKey, freshData, undefined, result.version, PERMANENT_TTL);

      return freshData;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      const cached = chatCache.get<AdminCourseSingularData>(cacheKey);
      if (cached) return cached.data;
      return undefined;
    },
    staleTime: 1800000, // 30 minutes
    refetchInterval: 1800000,
  });

  if (!data) {
    return <EditCourseSkeleton />;
  }

  const courseData = data;
  const isDirty = basicDirty || structureDirty;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="px-4 lg:px-6 py-2 md:py-5">
      <h1 className="text-3xl font-bold mb-3 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2">
          <BackConfirm href="/admin/courses" isDirty={isDirty} />
          <span>Edit Course:</span>
        </div>
        <span className="mt-4 md:mt-0 mb-2 md:mb-0 text-primary underline text-center sm:ml-2 ">
          {courseData?.title}
        </span>
      </h1>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 w-full ">
          <TabsTrigger value="basic-info">Basic Information</TabsTrigger>
          <TabsTrigger value="course-structure">Course Structure</TabsTrigger>
        </TabsList>

        <TabsContent value="basic-info">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Provide basic information about the course.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 md:p-4">
              <EditCourseForm data={courseData} setDirty={setBasicDirty} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="course-structure">
          <Card>
            <CardHeader>
              <CardTitle>Course Structure</CardTitle>
              <CardDescription>
                Here you can update your course structure.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-1 md:p-4">
              <CourseStructure data={courseData} setDirty={setStructureDirty} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
