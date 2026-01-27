/* 
  This component is used to display public courses
  - Supports search by title
  - Uses infinite scrolling
  - Uses client-side cache for first page
*/

"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import {
  PublicCourseCard,
  PublicCourseCardSkeleton,
} from "../../_components/PublicCourseCard";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import {
  CoursesCacheWithCursor,
  CoursesClientProps,
  PublicCourseType,
} from "@/lib/types/course";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";

// Each page returned by React Query
type CoursesPage = {
  courses: PublicCourseType[];
  nextCursor: string | null;
};

// CoursesClient Component
export function CoursesClient({ currentUserId }: CoursesClientProps) {
  // console.log("[CoursesClient] component mounted");

  // Read search param (?title=...)
  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");

  // Used to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);

  // Normalize userId
  const safeUserId = currentUserId ?? undefined;

  // Ref used for infinite scroll observer (strict margin/threshold)
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
    rootMargin: "0px",
  });

  // Mark component as mounted (client-only rendering)
  useEffect(() => {
    // console.log("[CoursesClient] setting mounted = true");
    setMounted(true);
  }, []);

  // Read cached courses + cursor from localStorage
  const cached = chatCache.get<CoursesCacheWithCursor>(
    "all_courses",
    safeUserId
  );

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
    // Query key depends on user + search
    queryKey: ["all_courses", safeUserId, searchTitle],

    // Seed data from cache for instant refresh (background revalidation)
    placeholderData: !searchTitle && cached ? {
        pages: [{
            courses: cached.data.data,
            nextCursor: cached.data.nextCursor
        }],
        pageParams: [null]
    } : undefined,



    // Fetch function (handles search + pagination)
    queryFn: async ({ pageParam }) => {

      // SEARCH MODE → no cache optimization
      if (searchTitle) {
        const result = await getAllCoursesAction(
          undefined,
          safeUserId,
          pageParam ?? null,
          searchTitle
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
      const cached = chatCache.get<CoursesCacheWithCursor>(
        "all_courses",
        safeUserId
      );

      // Send version only for first page
      const clientVersion = pageParam ? undefined : cached?.data.version;

      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null
      );

      // console.log("[CoursesClient] API result:", result);

      // Server says cache is still valid
      if (result.status === "not-modified") {
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
        };
      }


      // Persist merged courses + cursor
      if (!searchTitle) {
        const currentCache = chatCache.get<CoursesCacheWithCursor>("all_courses", safeUserId);
        
        let mergedCourses: PublicCourseType[] = [];
        
        if (pageParam) {
            // APPENDING: Only append if the cursor exists in our current list to avoid gaps
            const existingIds = new Set((currentCache?.data.data ?? []).map(c => c.id));
            const newUniqueCourses = result.courses.filter(c => !existingIds.has(c.id));
            
            mergedCourses = [...(currentCache?.data.data ?? []), ...newUniqueCourses];
        } else {
            // FIRST PAGE FETCH: 
            // If the server gave us FRESH 'data' for page 1, we reset the scroll to be safe.
            mergedCourses = result.courses;
        }

        chatCache.set(
          "all_courses",
          {
            data: mergedCourses,
            version: result.version,
            nextCursor: result.nextCursor,
          },
          safeUserId
        );
      }


      // console.groupEnd();

      return {
        courses: result.courses,
        nextCursor: result.nextCursor,
      };
    },

    // First page cursor
    initialPageParam: null,

    // Tell React Query how to fetch the next page
    getNextPageParam: (lastPage) => lastPage.nextCursor,

    // Cache freshness
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Flatten all pages into a single array
  const courses = data?.pages.flatMap((p) => p.courses).filter(Boolean) ?? [];

  // Infinite scroll observer trigger
  useEffect(() => {
    // Only fetch next page if we aren't already fetching (including background revalidation)
    if (inView && hasNextPage && !isFetching && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  // Initial loading skeleton (only if we have NO courses to show)
  if (!mounted || (isLoading && courses.length === 0)) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <PublicCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (courses.length === 0) {
    return <div className="p-12 text-center">No courses found</div>;
  }

  // Render courses
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map((course) => (
          <PublicCourseCard
            key={course.id}
            data={course}
            enrollmentStatus={course.enrollmentStatus ?? null}
          />
        ))}
      </div>

      {/* Infinite scroll loader */}
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
