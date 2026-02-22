/* 
  This component is used to display public courses
  - Supports search by title
  - Uses infinite scrolling
  - Uses client-side cache for first page
*/

"use client";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getAllCoursesAction } from "../actions";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { PublicCourseCard, PublicCourseCardSkeleton } from "../../_components/PublicCourseCard";
import { useEffect, useState, useRef } from "react";
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
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id;

  // Read search param (?title=...)
  const searchParams = useSearchParams();
  const searchTitle = searchParams.get("title");

  // Used to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef<string | null>(null);

  // Normalize userId
  const safeUserId = currentUserId ?? undefined;

  // Mark component as mounted + Persistent Logging (SPA Compatible)
  useEffect(() => {
    setMounted(true);

    const logKey = `all_courses_${safeUserId || 'guest'}`;
    if (hasLogged.current !== logKey) {
        const cached = chatCache.get<any>("all_courses", safeUserId);
        if (cached) {
            console.log(`%c[Courses] LOCAL HIT (v${cached.version || cached.data?.version}) from storage`, "color: #eab308; font-weight: bold");
        }
        hasLogged.current = logKey;
    }
  }, [safeUserId]);

  // Ref used for infinite scroll observer (strict margin/threshold)
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.5,
    rootMargin: "0px",
  });

  const cached = chatCache.get<CoursesCacheWithCursor>("all_courses", safeUserId);
  const coursesInCache = cached?.data?.data ?? [];

  // 🔹 DYNAMIC STALE TIME: 
  // 30s if: 1. Mutation flag set, OR 2. Any pending enrollment exists in local cache.
  // 30m otherwise.
  // This ensures we check Redis on page open for pending users, but avoid hits on instant hard refresh.
  const hasPending = Array.isArray(coursesInCache) && coursesInCache.some((c: any) => c.enrollmentStatus === "Pending");
  
  const dynamicStaleTime = (safeUserId && hasPending) ? 0 : 30 * 60 * 1000;
  
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

      console.info(`%c[Courses] SYNC CHECK: Version ${clientVersion || 'NONE'}`, "color: #eab308; font-weight: bold");

      const result = await getAllCoursesAction(
        clientVersion,
        safeUserId,
        pageParam ?? null
      );

      // Server says cache is still valid
      if (result.status === "not-modified") {
        console.log(`%c[Courses] Server: NOT_MODIFIED (v${clientVersion})`, "color: #eab308; font-weight: bold");
        chatCache.touch("all_courses", safeUserId);
        if (safeUserId) chatCache.clearSync(safeUserId);
        return {
          courses: cached?.data.data ?? [],
          nextCursor: cached?.data.nextCursor ?? null,
        };
      }

      console.log(`%c[Courses] Server: NEW_DATA -> Updating cache`, "color: #3b82f6; font-weight: bold");

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
          safeUserId,
          result.version,
          PERMANENT_TTL
        );

        // 🔹 BROAD SYNC TRIGGER: If we detect an enrollment status change (e.g. Approved)
        if (safeUserId) {
            const oldData = cached?.data?.data || [];
            const oldPendingCount = oldData.filter((c: any) => c.enrollmentStatus === "Pending").length;
            const newPendingCount = result.courses.filter((c: any) => c.enrollmentStatus === "Pending").length;
            
            if (oldPendingCount > 0 && newPendingCount < oldPendingCount) {
                console.log(`%c[Courses] Status change detected! Triggering broad cache clearance.`, "color: #9333ea; font-weight: bold");
                chatCache.invalidateUserDashboardData(safeUserId);
                // No longer need to setNeedsSync because we cleared the storage
            }
            chatCache.clearSync(safeUserId); 
        }
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
        {courses.map((course, index) => (
          <PublicCourseCard
            key={course.id}
            data={course}
            enrollmentStatus={course.enrollmentStatus ?? null}
            isPriority={index < 3}
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
