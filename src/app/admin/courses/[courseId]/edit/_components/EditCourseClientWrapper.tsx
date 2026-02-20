"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { AdminCourseSingularType } from "@/app/data/admin/admin-get-course";

interface EditCourseClientWrapperProps {
  data: AdminCourseSingularType; // ← fixed (NO ANY)
}

export function EditCourseClientWrapper({
  data,
}: EditCourseClientWrapperProps) {
  const [basicDirty, setBasicDirty] = useState(false);
  const [structureDirty, setStructureDirty] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "basic-info";

  const isDirty = basicDirty || structureDirty;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="px-4 lg:px-6 py-2 md:py-5">
      <h1 className="text-3xl font-bold mb-3 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Wrapper for Back + "Edit Course:" */}
        <div className="flex items-center gap-2">
          <BackConfirm href="/admin/courses" isDirty={isDirty} />
          <span>Edit Course:</span>
        </div>

        {/* Title (goes below on mobile, inline on desktop) */}
        <span className="mt-4 md:mt-0 mb-2 md:mb-0 text-primary underline text-center sm:ml-2 ">
          {data.title}
        </span>
      </h1>

      {!mounted ? (
        <div className="w-full h-[400px] flex items-center justify-center border-2 border-dashed rounded-lg animate-pulse bg-muted/20">
           <div className="flex flex-col items-center gap-2">
             <div className="h-4 w-32 bg-muted rounded"></div>
             <div className="h-3 w-48 bg-muted rounded"></div>
           </div>
        </div>
      ) : (
        <Tabs 
          value={currentTab} 
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
              <CardContent>
                <EditCourseForm data={data} setDirty={setBasicDirty} />
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
                <CourseStructure data={data} setDirty={setStructureDirty} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
