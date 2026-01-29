"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { adminGetCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import { AdminCourseCard, AdminCourseCardSkeleton } from "./AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";

type AdminCoursesPage = {
  courses: any[];
  nextCursor: string | null;
  total: number;
};

export function AdminCoursesClient({ initialData }: { initialData?: any }) {

  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");
  const [mounted, setMounted] = useState(false);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
    rootMargin: "0px",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const cached = chatCache.get<any>("admin_courses_list");

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    AdminCoursesPage,
    Error,
    InfiniteData<AdminCoursesPage, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: ["admin_courses_list", searchTitle],
    
    placeholderData: (previousData) => {
        if (previousData) return previousData;

        // 🔹 SEARCH MODE → Try to show whatever we have in cache first
        if (searchTitle && cached) {
            const q = searchTitle.toLowerCase();
            const allCached = cached.data.data ?? cached.data.courses ?? cached.data ?? [];
            const filtered = allCached.filter((c: any) => 
                c.title.toLowerCase().includes(q)
            ).slice(0, 9);
            
            return {
                pages: [{
                    courses: filtered,
                    nextCursor: null,
                    total: filtered.length
                }],
                pageParams: [null]
            };
        }

        // 🔹 NORMAL MODE → Show cached first page
        if (!searchTitle && cached) {
            return {
                pages: [{
                    courses: cached.data.data,
                    nextCursor: cached.data.nextCursor,
                    total: cached.data.total ?? 0
                }],
                pageParams: [null]
            };
        }

        return undefined;
    },

    // 🔹 USES SERVER DATA FOR FIRST PAINT
    initialData: (!searchTitle && (initialData as any)?.status === "data") ? {
        pages: [{
            courses: initialData.courses,
            nextCursor: initialData.nextCursor,
            total: initialData.total
        }],
        pageParams: [null]
    } : undefined,

    queryFn: async ({ pageParam }) => {
      // SEARCH MODE → no cache optimization
      if (searchTitle) {
        const result = await adminGetCoursesAction(
          undefined,
          pageParam ?? null,
          searchTitle
        );

        if ((result as any).status === "not-modified") {
          return { courses: [], nextCursor: null, total: 0 };
        }

        return {
          courses: result.courses ?? [],
          nextCursor: result.nextCursor ?? null,
          total: result.total ?? 0,
        };
      }

      // NORMAL MODE → cache + cursor support
      const cached = chatCache.get<any>("admin_courses_list");

      // Send version only for first page
      const clientVersion = pageParam ? undefined : cached?.version;

      const result = await adminGetCoursesAction(
        clientVersion,
        pageParam ?? null
      );

      // Server says cache is still valid
      if ((result as any).status === "not-modified") {
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
          total: cached?.data.total ?? 0,
        };
      }

      // Persist to cache with merge strategy
      if (!searchTitle) {
        const currentCache = chatCache.get<any>("admin_courses_list");
        
        let mergedCourses: any[] = [];
        
        if (pageParam) {
          // APPENDING: Merge new page with existing cached data
          const existingIds = new Set((currentCache?.data.data ?? []).map((c: any) => c.id));
          const newUniqueCourses = (result.courses ?? []).filter((c: any) => !existingIds.has(c.id));
          
          mergedCourses = [...(currentCache?.data.data ?? []), ...newUniqueCourses];
        } else {
          // FIRST PAGE FETCH: Reset with fresh data
          mergedCourses = result.courses ?? [];
        }

        chatCache.set("admin_courses_list", {
          data: mergedCourses,
          version: (result as any).version,
          nextCursor: result.nextCursor,
          total: result.total
        }, undefined, (result as any).version);
      }

      return {
        courses: result.courses ?? [],
        nextCursor: result.nextCursor ?? null,
        total: result.total ?? 0
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const courses = data?.pages.flatMap((p) => p.courses) || [];

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  if ((!mounted && !initialData) || (isLoading && courses.length === 0)) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <AdminCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        title="No courses found"
        description={searchTitle ? "Try searching for something else." : "Create a new course to get started."}
        buttonText={searchTitle ? "View All Courses" : "Create Course"}
        href={searchTitle ? "/admin/courses" : "/admin/courses/create"}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map((course: any) => (
          <AdminCourseCard key={course.id} data={course} />
        ))}
      </div>

      {hasNextPage && (
        <div ref={loadMoreRef} className="mt-10">
          {isFetchingNextPage && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {Array.from({ length: 3 }).map((_, i) => (
                <AdminCourseCardSkeleton key={`skeleton-${i}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
