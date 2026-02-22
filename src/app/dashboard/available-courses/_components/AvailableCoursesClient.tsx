"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "@/app/(users)/courses/actions";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { PublicCourseCard, PublicCourseCardSkeleton } from "../../../(users)/_components/PublicCourseCard";
import { useEffect, useState, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { CoursesCacheWithCursor, PublicCourseType } from "@/lib/types/course";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";

type CoursesPage = {
  courses: PublicCourseType[];
  nextCursor: string | null;
  total?: number;
};

export function AvailableCoursesClient() {
  const { session, isLoading: sessionLoading } = useSmartSession();
  const safeUserId = session?.user.id ?? undefined;

  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");
  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef(false);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
    rootMargin: "0px",
  });

  useEffect(() => {
    setMounted(true);

    if (!hasLogged.current && safeUserId) {
      const cacheKey = `available_courses_${safeUserId || 'guest'}`;
      const cached = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);
      if (cached) {
        console.log(`%c[AvailableCourses] LOCAL HIT (v${cached.version}). Rendering from storage.`, "color: #eab308; font-weight: bold");
      }
      hasLogged.current = true;
    }
  }, [safeUserId]);

  const cacheKey = `available_courses_${safeUserId || 'guest'}`;
  const cached = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    CoursesPage,
    Error,
    InfiniteData<CoursesPage, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: [cacheKey, searchTitle],
    
    placeholderData: (previousData) => {
        // 🔹 1. Local filtering of previous search results for instant feel
        if (previousData && searchTitle) {
            const q = searchTitle.toLowerCase();
            const filteredPages = previousData.pages.map(page => ({
                ...page,
                courses: page.courses.filter((c: any) => 
                    c.title.toLowerCase().includes(q) || 
                    (c.smallDescription?.toLowerCase().includes(q))
                )
            }));
            
            const hasMatches = filteredPages.some(p => p.courses.length > 0);
            if (hasMatches) {
                return {
                    ...previousData,
                    pages: filteredPages
                } as InfiniteData<CoursesPage, string | null>;
            }
        }

        if (previousData) return previousData;
        if (!mounted || sessionLoading) return undefined;

        // 🔹 2. Local filtering of global cache for first paint search
        if (searchTitle && cached) {
            const q = searchTitle.toLowerCase();
            const filtered = cached.data.data.filter((c: any) => 
                c.title.toLowerCase().includes(q)
            );
            
            if (filtered.length > 0) {
                return {
                    pages: [{
                        courses: filtered.slice(0, 9),
                        nextCursor: null,
                        total: filtered.length
                    }],
                    pageParams: [null]
                } as InfiniteData<CoursesPage, string | null>;
            }
        }

        // 🔹 3. NORMAL MODE → Show cached first page
        if (!searchTitle && cached) {
            return {
                pages: [{
                    courses: cached.data.data.slice(0, 9),
                    nextCursor: cached.data.nextCursor,
                    total: cached.data.data.length
                }],
                pageParams: [null]
            };
        }

        return undefined;
    },





    queryFn: async ({ pageParam }) => {
      // SEARCH MODE → no cache optimization
      if (searchTitle) {
        const result = await getAllCoursesAction(
          undefined,
          safeUserId,
          pageParam ?? null,
          searchTitle,
          true // onlyAvailable
        );

        if (result.status === "not-modified") {
          return { courses: [], nextCursor: null };
        }

        return {
          courses: result.courses,
          nextCursor: result.nextCursor,
        };
      }

      // NORMAL MODE → cache + cursor support
      const currentCache = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);

      // Send version only for first page
      const clientVersion = pageParam ? undefined : currentCache?.version;

      console.log(`[AvailableCourses] Smart Sync: Checking version (v${clientVersion || 'None'})...`);
      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null,
        undefined,
        true // onlyAvailable
      );

      // Server says cache is still valid
      if (result.status === "not-modified") {
        console.log(`%c[AvailableCourses] Server: NOT_MODIFIED (v${clientVersion})`, "color: #22c55e; font-weight: bold");
        chatCache.touch(cacheKey, safeUserId);
        if (safeUserId) chatCache.clearSync(safeUserId);
        return {
          courses: currentCache?.data.data ?? [],
          nextCursor: currentCache?.data.nextCursor ?? null,
          total: currentCache?.data.data.length ?? 0
        };
      }

      console.log(`%c[AvailableCourses] Server: NEW_DATA -> Updating Cache (v${result.version})`, "color: #3b82f6; font-weight: bold");

      // Persist merged courses + cursor to local storage
      if (!searchTitle) {
        let mergedCourses: PublicCourseType[] = [];
        
        if (pageParam) {
          // APPENDING: Only append if the cursor exists in our current list to avoid gaps
          const existingIds = new Set((currentCache?.data.data ?? []).map(c => c.id));
          const newUniqueCourses = result.courses.filter(c => !existingIds.has(c.id));
          
          mergedCourses = [...(currentCache?.data.data ?? []), ...newUniqueCourses];
        } else {
          // FIRST PAGE FETCH: Reset with fresh data
          mergedCourses = result.courses;
        }

        chatCache.set(
          cacheKey,
          {
            data: mergedCourses,
            version: result.version,
            nextCursor: result.nextCursor,
          },
          safeUserId,
          result.version,
          PERMANENT_TTL
        );

        // 🔹 BROAD SYNC TRIGGER: If we detect an enrollment status change (e.g. Approved)
        if (safeUserId) {
            const oldData = currentCache?.data?.data || [];
            const oldPendingCount = oldData.filter((c: any) => c.enrollmentStatus === "Pending").length;
            const newPendingCount = result.courses.filter((c: any) => c.enrollmentStatus === "Pending").length;
            
            if (oldPendingCount > 0 && newPendingCount < oldPendingCount) {
                console.log(`%c[AvailableCourses] Status change detected! Triggering broad cache clearance.`, "color: #9333ea; font-weight: bold");
                chatCache.invalidateUserDashboardData(safeUserId);
            }
            chatCache.clearSync(safeUserId); 
        }
      }

      return {
        courses: result.courses,
        nextCursor: result.nextCursor,
        total: result.courses.length // This is just the page total for now, but matches structure
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: () => {
        if (!searchTitle && typeof window !== "undefined") {
            const cached = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);
            if (cached) {
                return {
                    pages: [{
                        courses: cached.data.data,
                        nextCursor: cached.data.nextCursor || null,
                        total: cached.data.data.length
                    }],
                    pageParams: [null]
                };
            }
        }
        return undefined;
    },
    initialDataUpdatedAt: typeof window !== "undefined" && !searchTitle
        ? chatCache.get<any>(cacheKey, safeUserId)?.timestamp
        : undefined,
    staleTime: 1800000,
    refetchOnWindowFocus: true,
  });

  const courses = data?.pages.flatMap((p) => p.courses) ?? [];

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  if (!mounted || sessionLoading || (isLoading && courses.length === 0)) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <PublicCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No available courses found.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map((course, index) => (
          <PublicCourseCard
            key={course.id}
            data={course}
            enrollmentStatus={course.enrollmentStatus ?? null}
            isPriority={index < 3}
          />
        ))}
      </div>

      {hasNextPage && (
        <div ref={loadMoreRef} className="mt-10">
          {isFetchingNextPage && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {Array.from({ length: 3 }).map((_, i) => (
                <PublicCourseCardSkeleton key={`skeleton-${i}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
