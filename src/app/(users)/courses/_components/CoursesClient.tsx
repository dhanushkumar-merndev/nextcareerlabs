"use client";

import { useQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import { PublicCourseCard, PublicCourseCardSkeleton } from "../../_components/PublicCourseCard";

import { useState, useEffect } from "react";

interface CoursesClientProps {
    currentUserId?: string;
}

export function CoursesClient({ currentUserId }: CoursesClientProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const { data, isLoading } = useQuery({
        queryKey: ["all_courses", currentUserId],
        queryFn: async () => {
            const cached = chatCache.get<any>("all_courses", currentUserId);
            const clientVersion = cached?.version;

            console.log(`[Courses] Syncing with server... (Client Version: ${clientVersion || 'None'})`);
            const result = await getAllCoursesAction(clientVersion, currentUserId);

            if (result && (result as any).status === "not-modified" && cached) {
                console.log(`[Courses] Version matches. Keeping local data.`);
                return cached.data;
            }

            if (result && !(result as any).status) {
                console.log(`[Courses] Received fresh course list.`);
                chatCache.set("all_courses", result, currentUserId, (result as any).version);
            }
            return result;
        },
        initialData: () => {
            const cached = chatCache.get<any>("all_courses", currentUserId);
            if (cached) {
                console.log(`[Courses] Loaded cached list for user: ${currentUserId || 'guest'}`);
                return cached.data;
            }
            return undefined;
        },
        staleTime: 1800000, // 30 mins
        refetchOnWindowFocus: true,
    });

    if (!mounted || (isLoading && !data)) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                {Array.from({ length: 9 }).map((_, i) => (
                    <PublicCourseCardSkeleton key={i} />
                ))}
            </div>
        );
    }

    const courses = (data as any)?.courses || [];

    if (courses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-border/20 bg-muted/5">
                <p className="text-muted-foreground font-medium italic">No courses found.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {courses.map((course: any) => (
                <PublicCourseCard 
                    key={course.id} 
                    data={course} 
                    enrollmentStatus={course.enrollmentStatus}
                />
            ))}
        </div>
    );
}
