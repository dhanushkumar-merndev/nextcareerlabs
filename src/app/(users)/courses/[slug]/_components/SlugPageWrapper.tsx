/* eslint-disable @next/next/no-img-element */
/**
 * SlugPageWrapper Component
 *
 * - Loads course details using React Query
 * - Handles local caching and versioning
 * - Manages loading states and error handling
 * - Syncs enrollment status with local state
 * - Invalidates relevant caches on enrollment
 */

"use client";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  IconBook,
  IconCategory,
  IconChartBar,
  IconChevronDown,
  IconClock,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { CheckIcon, Loader2, Lock, TimerIcon } from "lucide-react";
import Link from "next/link";
import { JSX, useTransition } from "react";
import { EnrollmentButton } from "./EnrollmentButton";
import { constructUrl } from "@/hooks/use-construct-url";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSlugPageDataAction, startDemoCourseAction } from "../actions";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { useState, useEffect, useRef } from "react";

type CourseCacheData = { enrollmentStatus?: string | null; isFree?: boolean; firstLessonId?: string | null }; 
import { SlugPageSkeleton } from "./SlugPageSkeleton";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
// ✅ ADD import
import { usePendingDetection } from "@/hooks/use-pending-detection";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";

export function SlugPageWrapper({ slug }: { slug: string }) {
  const { session } = useSmartSession();
  const currentUserId = session?.user?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { triggerIfSingleStatusChanged } = usePendingDetection(currentUserId);
  const isHydrated = typeof window !== "undefined";
  const hasLogged = useRef<string | null>(null);

  // Persistent Logging
  useEffect(() => {
    const logKey = `${slug}_${currentUserId || "guest"}`;
    if (hasLogged.current !== logKey) {
      const cacheKey = `course_${slug}`;
      let cached = currentUserId
        ? chatCache.get<{ enrollmentStatus?: string | null; isFree?: boolean; firstLessonId?: string | null }>(cacheKey, currentUserId)
        : null;
      if (!cached) cached = chatCache.get<{ enrollmentStatus?: string | null; isFree?: boolean; firstLessonId?: string | null }>(cacheKey, undefined);

      if (cached) {
        console.log(
          `%c[SlugPage] LOCAL HIT (v${cached.version}) detected for ${slug}`,
          "color: #eab308; font-weight: bold",
        );
      }
      hasLogged.current = logKey;
    }
  }, [slug, currentUserId]);
  // SlugPageWrapper.tsx — Fixed useQuery block

  // ✅ Extract cache ONCE before useQuery
  const cacheKey = `course_${slug}`;
  const cachedEntry =
    typeof window !== "undefined"
      ? currentUserId
        ? (chatCache.get<CourseCacheData>(cacheKey, currentUserId) ??
          chatCache.get<CourseCacheData>(cacheKey, undefined))
        : chatCache.get<CourseCacheData>(cacheKey, undefined)
      : null;

  const { data, isLoading } = useQuery({
    queryKey: ["course_detail", slug, currentUserId],
    queryFn: async () => {
      // Use already-resolved cachedEntry instead of re-reading storage
      const clientVersion = cachedEntry?.version;
      // Fetches the course data from the server
      const result = await getSlugPageDataAction(
        slug,
        clientVersion,
        currentUserId,
      );
      // Checks if the course data is not modified
      if (result && "status" in result && result.status === "not-modified" && cachedEntry) {
        console.log(
          `%c[SlugPage] Server: NOT_MODIFIED (v${clientVersion})`,
          "color: #eab308; font-weight: bold",
        );
        chatCache.touch(cacheKey, currentUserId);
        if (currentUserId) chatCache.clearSync(currentUserId);
        return cachedEntry.data;
      }

      const isData = result && !("status" in result);
      if (isData) {
        console.log(
          `%c[SlugPage] Server: NEW_DATA -> Updating cache`,
          "color: #3b82f6; font-weight: bold",
        );

        if (currentUserId) {
          const oldStatus = cachedEntry?.data?.enrollmentStatus;
          const newStatus = result && "enrollmentStatus" in result ? result.enrollmentStatus : null;
          if (oldStatus === "Pending" && newStatus !== "Pending") {
            chatCache.invalidateUserDashboardData(currentUserId);

            // ✅ BROAD SYNC: Wake up all other dashboard queries
            queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey[0] as string;
                return (
                  key === "user_dashboard" ||
                  key === "my_courses" ||
                  key === "all_courses" ||
                  key === "enrolled_courses" ||
                  key === "user_enrolled_courses" ||
                  key === "user_resources_access" ||
                  key === "user_resources" ||
                  key === "chat_sidebar"
                );
              },
            });

            triggerIfSingleStatusChanged(oldStatus, newStatus);
            setTimeout(() => router.refresh(), 500);
          }
        }

        chatCache.set(
          cacheKey,
          result,
          currentUserId,
          (result && "version" in result ? result.version : undefined),
          PERMANENT_TTL,
        );
        if (currentUserId) chatCache.clearSync(currentUserId);
      }

      return result;
    },

    initialData: () => cachedEntry?.data,
    initialDataUpdatedAt: cachedEntry?.timestamp ?? undefined,

    staleTime: (() => {
      if (!cachedEntry) return 0;
      const isPending = cachedEntry.data?.enrollmentStatus === "Pending";
      const needsSync = currentUserId
        ? chatCache.needsSync(currentUserId) ||
          chatCache.hasAnyPending(currentUserId)
        : false;
      if (isPending || needsSync) return 0;
      return 30 * 60 * 1000;
    })(),

    placeholderData: (previousData) => previousData ?? cachedEntry?.data,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // 🔹 INSTANT DATA LOOKUP (DURING RENDER)
  // This allows us to render the page immediately on the client if cache exists,
  // even before hydration completes.

  const rawData = (data as Record<string, unknown>) || cachedEntry?.data;
  const course = (rawData?.course ?? (rawData?.id ? rawData : null)) as CourseType | null;
  const enrollmentStatus = (rawData?.enrollmentStatus as string | null) ?? null;

  if (!isHydrated || (!course && isLoading)) {
    return <SlugPageSkeleton />;
  }

  return (
    <SlugPageContent
      course={course}
      enrollmentStatus={enrollmentStatus}
      slug={slug}
      router={router}
      currentUserId={currentUserId ?? undefined}
    />
  );
}

type LessonT = { id: string; title: string; position?: number };
type ChapterT = { id: string; title: string; position?: number; lesson: LessonT[] };
type CourseType = { id: string; slug: string; title: string; fileKey: string | null; smallDescription?: string; description?: string | null; level?: string; duration?: number; isFree: boolean; freeChaptersCount: number; category?: string; chapter: ChapterT[] };

function SlugPageContent({
  course,
  enrollmentStatus,
  slug,
  router,
  currentUserId,
}: {
  course: CourseType | null;
  enrollmentStatus: string | null;
  slug: string;
  router: ReturnType<typeof useRouter>;
  currentUserId?: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDemoPending, startDemoTransition] = useTransition();
  const hasDemo = course?.isFree && (course.freeChaptersCount ?? 0) > 0;
  const firstLesson = course?.chapter
    ?.slice()
    .sort((a: ChapterT, b: ChapterT) => (a.position ?? 0) - (b.position ?? 0))
    ?.[0]
    ?.lesson?.slice()
    .sort((a: LessonT, b: LessonT) => (a.position ?? 0) - (b.position ?? 0))
    ?.[0];

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h2 className="text-2xl font-bold">Course Not Found</h2>
        <p className="text-muted-foreground">
          The course you are looking for might have been moved or deleted.
        </p>
        <Link href="/courses" className={buttonVariants()}>
          Go Back to Courses
        </Link>
      </div>
    );
  }

  function onStartDemo() {
    if (isDemoPending || !course || !firstLesson) return;
    if (!currentUserId) {
      window.location.assign(
        `/login?redirect=/dashboard/${course.slug}/${firstLesson.id}`,
      );
      return;
    }

    startDemoTransition(async () => {
      const { data: result, error } = await tryCatch(
        startDemoCourseAction(course.id),
      );

      if (error || result.status === "error") {
        toast.error(result?.message ?? "Failed to start demo");
        return;
      }

      chatCache.setNeedsSync(currentUserId);
      chatCache.invalidateUserDashboardData(currentUserId);
      chatCache.invalidate(`user_enrolled_courses_${currentUserId}`, currentUserId);
      chatCache.invalidate(`available_courses_${currentUserId}`, currentUserId);
      chatCache.invalidate(`course_${course.slug}`, currentUserId);
      chatCache.invalidate(`course_${course.slug}`, undefined);

      router.push(`/dashboard/${course.slug}/${firstLesson.id}`);
    });
  }
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-5 px-4 lg:px-6">
      <div className="order-1 lg:col-span-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-lg bg-accent">
          {!imageLoaded && <Skeleton className="absolute inset-0 z-10" />}
          <img
            src={constructUrl(course.fileKey ?? '')}
            alt="Thumbnail"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-500",
              imageLoaded ? "opacity-100" : "opacity-0",
            )}
            crossOrigin="anonymous"
            onLoad={() => setImageLoaded(true)}
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent"></div>
        </div>
        {/* Course Details */}
        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight">
              {course.title}
            </h1>
            <p className="text-lg text-muted-foreground leading-6 line-clamp-2">
              {course.smallDescription}
            </p>
          </div>
          {/* Course Badges */}
          <div className="flex flex-wrap gap-3">
            <Badge>
              <IconChartBar className="size-4" />
              <span>{course.level}</span>
            </Badge>
            <Badge>
              <TimerIcon className="size-4" />
              <span>{course.duration} hours</span>
            </Badge>
            {hasDemo ? (
              <Badge variant="outline" className="border-primary text-primary bg-transparent hover:bg-transparent">
                Demo
              </Badge>
            ) : null}
          </div>
        </div>
        <Separator className="my-8" />
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Course Description
          </h2>
          {/* Course Description */}
          <div>
            <RenderDescription
              json={course.description ? JSON.parse(course.description) : null}
            />
          </div>
        </div>
        <Separator className="mt-8 mb-6" />
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold tracking-tight">
              Course Content
            </h2>
            {/* Course Content Summary */}
            <div>
              <span className="text-primary">{course.chapter.length}</span>{" "}
              chapters |{" "}
              <span className="text-primary">
                {course.chapter.reduce(
                  (total: number, chapter: ChapterT) =>
                    total + chapter.lesson.length,
                  0,
                ) || 0}
              </span>{" "}
              Lessons
            </div>
          </div>
          {hasDemo && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">
              <span className="font-medium">Demo:</span> First{" "}
              {course.freeChaptersCount} chapter
              {course.freeChaptersCount > 1 ? "s" : ""} available without approval
            </div>
          )}
          {/* Course Chapters */}
          <div className="space-y-4">
            {course.chapter.map((chapter: ChapterT, index: number) => {
              const isLockedChapter =
                enrollmentStatus !== "Granted" &&
                hasDemo &&
                (chapter.position ?? index + 1) > course.freeChaptersCount;

              return (
              <Collapsible key={chapter.id} defaultOpen={index === 0}>
                <Card className="p-0 overflow-hidden border-2 transition-all duration-200 hover:shadow-md gap-0">
                  <CollapsibleTrigger className="w-full">
                    <CardContent className="p-6 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <p className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                            {index + 1}
                          </p>
                          <div>
                            <h3 className={cn(
                              "text-xl font-semibold text-left flex items-center gap-2",
                              isLockedChapter && "text-muted-foreground",
                            )}>
                              {chapter.title}
                              {isLockedChapter && <Lock className="size-4" />}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 text-left">
                              {chapter.lesson.length} Lesson
                              {chapter.lesson.length > 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={"outline"}
                            className="hidden md:block text-sm rounded-sm "
                          >
                            {chapter.lesson.length} Lesson
                            {chapter.lesson.length > 1 ? "s" : ""}
                          </Badge>
                          <IconChevronDown className="size-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {/* Course Lessons */}
                    <div className="border-t bg-muted/20">
                      <div className="p-6 pt-4 space-y-3">
                        {chapter.lesson.map(
                          (lesson: LessonT, lessonIndex: number) => (
                            <div
                              key={lesson.id}
                              className={cn(
                                "flex items-center gap-4 rounded-lg p-3 transition-colors group",
                                isLockedChapter
                                  ? "opacity-55"
                                  : "hover:bg-accent",
                              )}
                            >
                              <div className="flex size-8 items-center justify-center rounded-full bg-background border-2 border-primary/20">
                                {isLockedChapter ? (
                                  <Lock className="size-4 text-muted-foreground" />
                                ) : (
                                  <IconPlayerPlay className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {lesson.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Lesson {lessonIndex + 1}
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              );
            })}
          </div>
        </div>
      </div>
      {/* Course Sidebar */}
      <div className="order-2 lg:col-span-1">
        <div className="sticky top-20 h-fit max-h-[calc(100vh-(--spacing(24)))]  pb-4 md:pb-0 scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent hover:scrollbar-thumb-primary/20 transition-colors">
          <div className="relative">
            <Card className="py-0 shadow-lg border border-border/50 rounded-xl">
              <CardContent className="p-6 space-y-8">
                {/* Benefits / Course Meta */}
                <div className="rounded-xl bg-muted/40 p-5 border border-border/40 space-y-5">
                  <h4 className="font-semibold text-base">What you will get</h4>

                  <div className="flex flex-col gap-4">
                    <FeatureRow
                      icon={<IconClock className="size-4" />}
                      title="Duration"
                      value={`${course.duration} hours`}
                    />

                    <FeatureRow
                      icon={<IconChartBar className="size-4" />}
                      title="Level"
                      value={course.level ?? ''}
                    />

                    <FeatureRow
                      icon={<IconCategory className="size-4" />}
                      title="Category"
                      value={course.category ?? ''}
                    />

                    <FeatureRow
                      icon={<IconBook className="size-4" />}
                      title="Total Chapters"
                      value={`${course.chapter.length} Chapters`}
                    />

                    <FeatureRow
                      icon={<IconBook className="size-4" />}
                      title="Total Lessons"
                      value={`${course.chapter.reduce(
                        (total: number, chapter: ChapterT) =>
                          total + chapter.lesson.length,
                        0,
                      )} Lessons`}
                    />

                  </div>
                </div>

                {/* Course Includes */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-base">
                    This course includes:
                  </h4>

                  <ul className="space-y-3">
                    {[
                      "Full lifetime access",
                      "Access on mobile and desktop",
                      "Certificate of completion",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 text-sm"
                      >
                        <div className="rounded-full bg-green-500/10 text-green-600 p-1.5">
                          <CheckIcon className="size-3" />
                        </div>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  {/* Enrollment Button */}
                  {enrollmentStatus === "Granted" ? (
                    <Link
                      className={buttonVariants({ className: "w-full" })}
                      href={(() => {
                        const firstLesson = course.chapter
                          ?.sort(
                            (a: ChapterT, b: ChapterT) =>
                              (a.position ?? 0) - (b.position ?? 0),
                          )?.[0]
                          ?.lesson?.sort(
                            (a: LessonT, b: LessonT) =>
                              (a.position ?? 0) - (b.position ?? 0),
                          )?.[0];
                        if (!currentUserId) {
                          return `/login?redirect=/dashboard/${course.slug}${firstLesson ? `/${firstLesson.id}` : ""}`;
                        }
                        return firstLesson
                          ? `/dashboard/${course.slug}/${firstLesson.id}`
                          : `/dashboard/${course.slug}`;
                      })()}
                    >
                      Watch Course
                    </Link>
                  ) : hasDemo && firstLesson ? (
                    <div className="grid gap-3">
                      <Button
                        className="w-full"
                        onClick={onStartDemo}
                        disabled={isDemoPending}
                      >
                        {isDemoPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Loading...
                          </>
                        ) : enrollmentStatus === "Demo" ? (
                          "Continue Demo"
                        ) : (
                          "Start Demo"
                        )}
                      </Button>
                      <EnrollmentButton
                        courseId={course.id}
                        slug={slug}
                        status={enrollmentStatus}
                        isFree={course.isFree}
                      />
                    </div>
                  ) : (
                    <EnrollmentButton
                      courseId={course.id}
                      slug={slug}
                      status={enrollmentStatus}
                      isFree={course.isFree}
                    />
                  )}
                  <Button
                    onClick={() => router.back()}
                    variant="outline"
                    className="w-full mt-4"
                  >
                    Go Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
// Feature Row Component
function FeatureRow({
  icon,
  title,
  value,
}: {
  icon: JSX.Element;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
          {icon}
        </div>
        <p className="text-sm font-medium">{title}</p>
      </div>

      <p className="text-sm text-muted-foreground font-medium">{value}</p>
    </div>
  );
}
