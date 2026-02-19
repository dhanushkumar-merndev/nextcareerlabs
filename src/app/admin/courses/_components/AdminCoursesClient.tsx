"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { adminGetCoursesAction } from "../actions";

import { AdminCourseCard, AdminCourseCardSkeleton } from "./AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";

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
  
  // 🔥 Hydration: Sync server-provided data to local storage on mount
  useEffect(() => {
    if (initialData && !initialData.status) {
        const cacheKey = "admin_courses_list";
        const currentCache = chatCache.get<any>(cacheKey);
        
        // Sync if version differs or doesn't exist
        if (!currentCache || currentCache.version !== initialData.version) {
            console.log(`[Smart Sync] Hydrating admin courses to Local Storage (Version: ${initialData.version})`);
            chatCache.set(cacheKey, {
                data: initialData.data.courses,
                version: initialData.version,
                nextCursor: initialData.data.nextCursor,
                total: initialData.data.total
            }, undefined, initialData.version, 21600000); // 6 hours
        }
    }
  }, [initialData]);

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
        if (!mounted) return undefined;
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
    initialData: (!searchTitle && initialData && !initialData.status) ? {
        pages: [{
            courses: initialData.data.courses,
            nextCursor: initialData.data.nextCursor,
            total: initialData.data.total
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
          courses: (result as any).data?.courses ?? [],
          nextCursor: (result as any).data?.nextCursor ?? null,
          total: (result as any).data?.total ?? 0,
        };
      }

      // NORMAL MODE → cache + cursor support
      const cached = chatCache.get<any>("admin_courses_list");

      // Send version only for first page
      const clientVersion = pageParam ? undefined : cached?.version;

      if (!pageParam) {
          if (cached) {
              console.log(`[Smart Sync] Courses: Local Cache HIT. Validating first page with Server...`);
          } else {
              console.log(`[Smart Sync] Courses: Local Cache MISS. Fetching from Server...`);
          }
      }

      const result = await adminGetCoursesAction(
        clientVersion,
        pageParam ?? null
      );

      // Server says cache is still valid
      if ((result as any).status === "not-modified") {
        console.log(`[Smart Sync] Courses: Server says NOT_MODIFIED. Using Local Data.`);
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
          const newUniqueCourses = ((result as any).data?.courses ?? []).filter((c: any) => !existingIds.has(c.id));
          
          mergedCourses = [...(currentCache?.data.data ?? []), ...newUniqueCourses];
        } else {
          // FIRST PAGE FETCH: Reset with fresh data
          mergedCourses = (result as any).data?.courses ?? [];
        }

        console.log(`[Smart Sync] Courses: Received fresh data (Version: ${(result as any).version})`);
        chatCache.set("admin_courses_list", {
          data: mergedCourses,
          version: (result as any).version,
          nextCursor: (result as any).data?.nextCursor,
          total: (result as any).data?.total
        }, undefined, (result as any).version, 21600000); // 6 hours
      }

      return {
        courses: (result as any).data?.courses ?? [],
        nextCursor: (result as any).data?.nextCursor ?? null,
        total: (result as any).data?.total ?? 0
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 10800000, // 3 hours (Version check interval)
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
