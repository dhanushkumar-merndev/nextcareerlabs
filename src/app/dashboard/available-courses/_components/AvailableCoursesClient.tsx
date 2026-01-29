"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "@/app/(users)/courses/actions";
import { chatCache } from "@/lib/chat-cache";
import { PublicCourseCard, PublicCourseCardSkeleton } from "../../../(users)/_components/PublicCourseCard";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { CoursesCacheWithCursor, PublicCourseType } from "@/lib/types/course";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";

type CoursesPage = {
  courses: PublicCourseType[];
  nextCursor: string | null;
};

export function AvailableCoursesClient({ currentUserId }: { currentUserId?: string }) {
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

  const safeUserId = currentUserId ?? undefined;
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
        if (previousData) return previousData;
        if (!mounted) return undefined;

        // 🔹 SEARCH MODE → Try to show whatever we have in cache first
        if (searchTitle && cached) {
            const q = searchTitle.toLowerCase();
            const filtered = cached.data.data.filter((c: any) => 
                c.title.toLowerCase().includes(q)
            ).slice(0, 9);
            
            return {
                pages: [{
                    courses: filtered,
                    nextCursor: null
                }],
                pageParams: [null]
            };
        }

        // 🔹 NORMAL MODE → Show cached first page
        if (!searchTitle && cached) {
            return {
                pages: [{
                    courses: cached.data.data,
                    nextCursor: cached.data.nextCursor
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
      const cached = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);

      // Send version only for first page
      const clientVersion = pageParam ? undefined : cached?.data.version;

      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null,
        undefined,
        true // onlyAvailable
      );

      // Server says cache is still valid
      if (result.status === "not-modified") {
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
        };
      }

      // Persist merged courses + cursor to local storage
      if (!searchTitle) {
        const currentCache = chatCache.get<CoursesCacheWithCursor>(cacheKey, safeUserId);
        
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
          safeUserId
        );
      }

      return {
        courses: result.courses,
        nextCursor: result.nextCursor,
      };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const courses = data?.pages.flatMap((p) => p.courses) ?? [];

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  if (!mounted || (isLoading && courses.length === 0)) {
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
        {courses.map((course) => (
          <PublicCourseCard
            key={course.id}
            data={course}
            enrollmentStatus={null}
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
