"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { adminGetCoursesAction } from "../actions";

import { AdminCourseCard, AdminCourseCardSkeleton } from "./AdminCourseCard";
import { EmptyState } from "@/components/general/EmptyState";
import { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";

type AdminCoursesPage = {
  courses: any[];
  nextCursor: string | null;
  total: number;
};

export function AdminCoursesClient() {
  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");
  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef<string | null>(null);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
    rootMargin: "0px",
  });

  useEffect(() => {
    setMounted(true);

    const logKey = `admin_courses_${searchTitle || "all"}`;
    if (hasLogged.current !== logKey) {
      const cached = chatCache.get<any>("admin_courses_list");
      if (cached) {
        console.log(
          `%c[AdminCourses] LOCAL HIT (v${cached.version}). Rendering from device storage.`,
          "color: #eab308; font-weight: bold",
        );
      }
      hasLogged.current = logKey;
    }
  }, [searchTitle]);

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

      // 🔹 SEARCH MODE → Local Filter for instant feel
      if (searchTitle && cached) {
        const q = searchTitle.toLowerCase();
        const filtered = (
          cached.data?.data ??
          cached.data?.courses ??
          cached.data ??
          []
        ).filter(
          (c: any) =>
            c.title.toLowerCase().includes(q) ||
            c.smallDescription?.toLowerCase().includes(q),
        );

        if (filtered.length > 0) {
          return {
            pages: [
              {
                courses: filtered.slice(0, 9),
                nextCursor: null,
                total: filtered.length,
              },
            ],
            pageParams: [null],
          } as InfiniteData<AdminCoursesPage, string | null>;
        }
      }

      // 🔹 NORMAL MODE → Show cached first page
      if (!searchTitle && cached) {
        const courses =
          cached.data?.data ?? cached.data?.courses ?? cached.data ?? [];
        return {
          pages: [
            {
              courses: courses,
              nextCursor: cached.data.nextCursor || null,
              total: cached.data.total ?? courses.length,
            },
          ],
          pageParams: [null],
        };
      }

      return undefined;
    },

    initialData: () => {
      if (typeof window === "undefined" || searchTitle) return undefined;
      const cached = chatCache.get<any>("admin_courses_list");
      if (cached) {
        const courses =
          cached.data?.data ?? cached.data?.courses ?? cached.data ?? [];
        return {
          pages: [
            {
              courses: courses,
              nextCursor: cached.data?.nextCursor ?? null,
              total: cached.data?.total ?? courses.length,
            },
          ],
          pageParams: [null],
        };
      }
      return undefined;
    },

    initialDataUpdatedAt:
      typeof window !== "undefined" && !searchTitle
        ? cached?.timestamp
        : undefined,

    queryFn: async ({ pageParam }) => {
      // SEARCH MODE
      if (searchTitle) {
        const result = await adminGetCoursesAction(
          undefined,
          pageParam ?? null,
          searchTitle,
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

      // NORMAL MODE
      const cached = chatCache.get<any>("admin_courses_list");
      const clientVersion = pageParam ? undefined : cached?.version;

      const result = await adminGetCoursesAction(
        clientVersion,
        pageParam ?? null,
      );

      if ((result as any).status === "not-modified") {
        console.log(
          `%c[AdminCourses] Server: NOT_MODIFIED (v${clientVersion})`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.touch("admin_courses_list");
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
          total: cached?.data.total ?? 0,
        };
      }

      // Sync to cache
      if (!searchTitle) {
        const currentCache = chatCache.get<any>("admin_courses_list");
        let mergedCourses: any[] = [];
        let finalCursor = (result as any).data?.nextCursor;

        const newCourses = (result as any).data?.courses ?? [];
        const existingData = currentCache?.data.data ?? [];

        if (pageParam) {
          // APPENDING: Standard merge for subsequent pages
          const existingIds = new Set(existingData.map((c: any) => c.id));
          const newUniqueCourses = newCourses.filter(
            (c: any) => !existingIds.has(c.id),
          );
          mergedCourses = [...existingData, ...newUniqueCourses];
        } else {
          // FIRST PAGE REVALIDATION: Preserve the tail if the cache is longer than the new page
          if (existingData.length > newCourses.length) {
            const newIds = new Set(newCourses.map((c: any) => c.id));
            const tail = existingData.filter((c: any) => !newIds.has(c.id));
            mergedCourses = [...newCourses, ...tail];
            // Keep the deeper cursor to avoid "silent restarts" of the infinite scroll
            finalCursor = currentCache?.data.nextCursor || finalCursor;
          } else {
            mergedCourses = newCourses;
          }
        }

        console.log(
          `%c[AdminCourses] Server: NEW_DATA (v${(result as any).version}). Syncing ${mergedCourses.length} items to cache.`,
          "color: #3b82f6; font-weight: bold",
        );
        chatCache.set(
          "admin_courses_list",
          {
            data: mergedCourses,
            version: (result as any).version,
            nextCursor: finalCursor,
            total: (result as any).data?.total || mergedCourses.length,
          },
          undefined,
          (result as any).version,
          PERMANENT_TTL,
        );
      }

      return {
        courses: (result as any).data?.courses ?? [],
        nextCursor: (result as any).data?.nextCursor ?? null,
        total: (result as any).data?.total ?? 0,
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1800000,
    refetchInterval: 1800000,
    enabled: mounted,
  });

  const courses = data?.pages.flatMap((p) => p.courses) || [];

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  // Strict hydration guard
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <AdminCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isLoading && courses.length === 0) {
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
        description={
          searchTitle
            ? "Try searching for something else."
            : "Create a new course to get started."
        }
        buttonText={searchTitle ? "View All Courses" : "Create Course"}
        href={searchTitle ? "/admin/courses" : "/admin/courses/create"}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map((course: any, index: number) => (
          <AdminCourseCard
            key={course.id}
            data={course}
            isPriority={index < 6}
          />
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
