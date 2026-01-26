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
import { useEffect, useRef, useState } from "react";
import { Course, CoursesClientProps } from "@/lib/types/course";
import { useSearchParams } from "next/navigation";


// CoursesClient Component
export function CoursesClient({ currentUserId }: CoursesClientProps) {
  // console.log("[CoursesClient] component mounted");

  // Read search params (?title=xyz)
  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");

  // console.log("[CoursesClient] searchTitle:", searchTitle);

  // Used to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);

  // Normalize userId
  const safeUserId = currentUserId ?? undefined;

  // Ref for infinite scroll trigger
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Mark component as mounted
  useEffect(() => {
    // console.log("[CoursesClient] setting mounted = true");
    setMounted(true);
  }, []);


  // Fetch courses (Infinite Query)
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["all_courses", safeUserId, searchTitle],

    queryFn: async ({ pageParam }) => {
      // console.group("[CoursesClient] queryFn");
      // console.log("pageParam:", pageParam);
      // console.log("searchTitle:", searchTitle);

      // SEARCH MODE (no caching)
      if (searchTitle) {
        // console.log("[CoursesClient] search mode enabled");

        const result = await getAllCoursesAction(
          undefined,
          safeUserId,
          pageParam ?? null,
          searchTitle
        );

        // console.log("[CoursesClient] search result:", result);
        // console.groupEnd();

        if (result.status === "not-modified") {
          return { courses: [], nextCursor: null };
        }

        return {
          courses: result.courses,
          nextCursor: result.nextCursor,
        };
      }

      // NORMAL MODE (with cache)
      const cached = chatCache.get<Course[]>("all_courses", safeUserId);
      const clientVersion = pageParam ? undefined : cached?.version;
      // console.log("[CoursesClient] cached data:", cached);
      // console.log("[CoursesClient] clientVersion:", clientVersion);
      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null
      );
      // console.log("[CoursesClient] API result:", result);
      // If server says data not changed, return cache
      if (result.status === "not-modified") {
        // console.log("[CoursesClient] using cached courses");
        // console.groupEnd();

        return {
          courses: cached?.data ?? [],
          nextCursor: null,
        };
      }

      // Cache ALL loaded pages (append mode)
      const existing = chatCache.get<Course[]>("all_courses", safeUserId);

      const mergedCourses = pageParam
        ? [...(existing?.data ?? []), ...result.courses]
        : result.courses;

      chatCache.set(
        "all_courses",
        mergedCourses,
        safeUserId,
        result.version
      );


      // console.groupEnd();

      return {
        courses: result.courses,
        nextCursor: result.nextCursor,
      };
    },

    initialPageParam: null as string | null,
    getNextPageParam: lastPage => {
      // console.log("[CoursesClient] nextCursor:", lastPage.nextCursor);
      return lastPage.nextCursor;
    },

    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: true,
  });

 
  // Flatten paginated data
 
  const courses = data?.pages.flatMap(p => p.courses) ?? [];

  // console.log("[CoursesClient] render state", {
  //   isLoading,
  //   isFetchingNextPage,
  //   hasNextPage,
  //   courseCount: courses.length,
  // });


  // Infinite Scroll Observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) {
      // console.log("[CoursesClient] observer not attached");
      return;
    }
    // console.log("[CoursesClient] attaching IntersectionObserver");
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        // console.log("[CoursesClient] loadMoreRef intersected → fetchNextPage");
        fetchNextPage();
      }
    });
    observer.observe(loadMoreRef.current);
    return () => {
      // console.log("[CoursesClient] disconnecting observer");
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage]);


  // Loading Skeleton
  if (!mounted || isLoading) {
    // console.log("[CoursesClient] showing initial skeleton");

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {Array.from({ length: 9 }).map((_, i) => (
          <PublicCourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }


  // Empty State
  if (courses.length === 0) {
    // console.log("[CoursesClient] no courses found");
    return <div className="p-12 text-center">No courses found</div>;
  }

  // Render Courses
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map(course => (
          <PublicCourseCard
            key={course.id}
            data={course}
            enrollmentStatus={course.enrollmentStatus}
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
