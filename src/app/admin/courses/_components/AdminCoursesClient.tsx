"use client";

import { useQuery } from "@tanstack/react-query";
import { adminGetCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import { AdminCourseCard } from "./AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";

export function AdminCoursesClient() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const { data, isLoading } = useQuery({
        queryKey: ["admin_courses_list"],
        queryFn: async () => {
            const cached = chatCache.get<any>("admin_courses_list");
            const clientVersion = cached?.version;

            console.log(`[AdminCourses] Syncing...`);
            const result = await adminGetCoursesAction(clientVersion);

            if (result && (result as any).status === "not-modified" && cached) {
                return cached.data;
            }

            if (result && !(result as any).status) {
                chatCache.set("admin_courses_list", result, undefined, (result as any).version);
            }
            return result;
        },
        initialData: () => {
            const cached = chatCache.get<any>("admin_courses_list");
            if (cached) {
                return cached.data;
            }
            return undefined;
        },
        staleTime: 1800000, // 30 mins
        refetchOnWindowFocus: true,
    });

    if (!mounted || (isLoading && !data)) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const courses = (data as any)?.courses || [];

    if (courses.length === 0) {
        return (
            <EmptyState
                title="No courses found"
                description="Create a new course to get started."
                buttonText="Create Course"
                href="/admin/courses/create"
            />
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-7">
            {courses.map((course: any) => (
                <AdminCourseCard key={course.id} data={course} />
            ))}
        </div>
    );
}
