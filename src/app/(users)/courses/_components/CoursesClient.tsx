/* 
  This component is used to display public courses
  - Supports search by title
  - Uses infinite scrolling
  - Uses client-side cache for first page
*/

"use client";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getAllCoursesAction } from "../actions";
import { chatCache } from "@/lib/chat-cache";
import { PublicCourseCard, PublicCourseCardSkeleton } from "../../_components/PublicCourseCard";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { CoursesCacheWithCursor, PublicCourseType } from "@/lib/types/course";
import { useSearchParams } from "next/navigation";
import type { InfiniteData } from "@tanstack/react-query";

// Each page returned by React Query
type CoursesPage = {
  courses: PublicCourseType[];
  nextCursor: string | null;
};

// CoursesClient Component
export function CoursesClient({ initialData }: { initialData?: any }) {
  const { session, isLoading: isSessionPending } = useSmartSession();
  const currentUserId = session?.user?.id;

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

  // Mark component as mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  const cached = chatCache.get<CoursesCacheWithCursor>(
    "all_courses",
    safeUserId
  );

  const coursesInCache = cached?.data?.data ?? [];
  const isGlobalInstant = cached?.data?.instantSync === true;

  const hasSyncTrigger = Array.isArray(coursesInCache) && 
    coursesInCache.some((c: any) => {
      if (c.enrollmentStatus === "Pending") return true;
      if (isGlobalInstant && (c.enrollmentStatus === "Revoked" || c.enrollmentStatus === "Rejected")) return true;
      return false;
    });
  
  const dynamicStaleTime = hasSyncTrigger ? 0 : 30 * 60 * 1000;
  
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
    placeholderData: (previousData) => {
        if (previousData) return previousData;
        
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
            console.log(`[Courses] HYDRATION HIT (v${cached.version || cached.data?.version})`);
            return {
                pages: [{
                    courses: cached.data.data || cached.data,
                    nextCursor: cached.data.nextCursor || null
                }],
                pageParams: [null]
            };
        }

        return undefined;
    },

    // 🔹 USES SERVER DATA FOR FIRST PAINT (if guest or no cache)
    initialData: () => {
        if (!searchTitle && initialData && initialData.status === "data") {
            console.log(`[Courses] SERVER HIT (First Load)`);
            return {
                pages: [{
                    courses: initialData.courses,
                    nextCursor: initialData.nextCursor,
                }],
                pageParams: [null]
            };
        }
        
        // Fallback to cache even in initialData to prevent flickering
        if (!searchTitle && typeof window !== "undefined" && cached) {
            console.log(`[Courses] INITIAL DATA HIT (v${cached.version || cached.data?.version}) from storage`);
            return {
                pages: [{
                    courses: cached.data.data || cached.data,
                    nextCursor: cached.data.nextCursor || null
                }],
                pageParams: [null]
            };
        }
        return undefined;
    },

    initialDataUpdatedAt: typeof window !== "undefined" && !searchTitle
        ? cached?.timestamp
        : undefined,

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
      const cached = chatCache.get<any>(
        "all_courses",
        safeUserId
      );

      // Send version only for first page
      // chatCache.get returns { data, version, timestamp }
      const clientVersion = pageParam ? undefined : (cached?.version);

      console.info(`%c[Courses] SYNC CHECK: %cVersion ${clientVersion || 'NONE'}`, "color: cyan; font-weight: bold", "color: white");

      console.log(`[Courses] DEBUG: Starting Sync attempt. Version detected in storage: ${clientVersion || 'NULL'}`);
      
      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null
      );

      // Server says cache is still valid
      if (result.status === "not-modified") {
        console.log(`[Courses] Server: NOT_MODIFIED (v${clientVersion})`);
        chatCache.touch("all_courses", safeUserId);
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
        };
      }

      console.log(`[Courses] Server: NEW_DATA -> Updating cache`);

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
            instantSync: result.instantSync,
          },
          safeUserId,
          result.version
        );
      }

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
    staleTime: dynamicStaleTime,
    refetchOnWindowFocus: true,
    // 🔹 OPTIMIZATION: Wait for session to be stable before starting background sync
    // This prevents the "Double Fetch" (Guest then User) on refresh
    enabled: mounted && !isSessionPending,
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
  if ((!mounted && !initialData) || (isLoading && courses.length === 0)) {
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
