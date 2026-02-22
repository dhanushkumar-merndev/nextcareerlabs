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
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import {IconBook, IconCategory, IconChartBar, IconChevronDown, IconClock, IconPlayerPlay} from "@tabler/icons-react";
import { CheckIcon, TimerIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { JSX } from "react";
import { EnrollmentButton } from "./EnrollmentButton";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { useQuery } from "@tanstack/react-query";
import { getSlugPageDataAction } from "../actions";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache } from "@/lib/chat-cache";
import { useState, useEffect, useRef } from "react";
import Loader from "@/components/ui/Loader";
import { SlugPageSkeleton } from "./SlugPageSkeleton";
import { useRouter } from "next/navigation";

export function SlugPageWrapper({
  slug,
}: {
  slug: string;
}) {
  const { session } = useSmartSession();
  const currentUserId = session?.user?.id;
  const router = useRouter();
  // Used to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  const hasLogged = useRef<string | null>(null);

  // Mark component as mounted + Persistent Logging
  useEffect(() => {
    setMounted(true);

    // 🔹 PERSISTENT LOGGING (SPA COMPATIBLE)
    const logKey = `${slug}_${currentUserId || 'guest'}`;
    if (hasLogged.current !== logKey) {
        const cacheKey = `course_${slug}`;
        let cached = currentUserId ? chatCache.get<any>(cacheKey, currentUserId) : null;
        if (!cached) cached = chatCache.get<any>(cacheKey, undefined);

        if (cached) {
            console.log(`%c[SlugPage] LOCAL HIT (v${cached.version}) detected for ${slug}`, "color: #eab308; font-weight: bold");
        }
        hasLogged.current = logKey;
    }
  }, [slug, currentUserId]);

  // UseQuery to fetch course data
  const { data, isLoading } = useQuery({
    queryKey: ["course_detail", slug, currentUserId],
    queryFn: async () => {
      const cacheKey = `course_${slug}`;
      
      // 🔹 TRY USER-SPECIFIC FIRST, FALLBACK TO GUEST
      let cached = currentUserId ? chatCache.get<any>(cacheKey, currentUserId) : null;
      if (!cached) cached = chatCache.get<any>(cacheKey, undefined);
      
      const clientVersion = cached?.version;

      const result = await getSlugPageDataAction(slug, clientVersion, currentUserId);

      if (result && (result as any).status === "not-modified" && cached) {
        console.log(`%c[SlugPage] Server: NOT_MODIFIED (v${clientVersion})`, "color: #eab308; font-weight: bold");
        chatCache.touch(cacheKey, currentUserId);
        return cached.data;
      }

      const isData = result && !(result as any).status;
      if (isData) {
        chatCache.set(cacheKey, result, currentUserId, (result as any).version);
      }
      return result;
    },
    initialData: () => {
        if (typeof window === "undefined") return undefined;
        const cacheKey = `course_${slug}`;
        let cached = currentUserId ? chatCache.get<any>(cacheKey, currentUserId) : null;
        if (!cached) cached = chatCache.get<any>(cacheKey, undefined);
        return cached?.data;
    },
    initialDataUpdatedAt: typeof window !== "undefined"
      ? (currentUserId 
          ? chatCache.get<any>(`course_${slug}`, currentUserId)?.timestamp 
          : chatCache.get<any>(`course_${slug}`, undefined)?.timestamp)
      : undefined,
    // Dynamic stale time: 0 for enrolled users, 30m for others
    staleTime: ((): number => {
        const cacheKey = `course_${slug}`;
        let cached = currentUserId ? chatCache.get<any>(cacheKey, currentUserId) : null;
        if (!cached) cached = chatCache.get<any>(cacheKey, undefined);
        
        const isPending = cached?.data?.enrollmentStatus === "Pending";
        return isPending ? 0 : 1800000;
    })(),
    // Use cached data for instant initial paint
    placeholderData: (previousData) => {
        if (previousData) return previousData;
        
        const cacheKey = `course_${slug}`;

        // 🔹 DURING HYDRATION / SESSION LOADING:
        // Try to find ANY cache for this slug (User or Guest)
        // ONLY if mounted to prevent hydration mismatch
        if (typeof window !== "undefined") {
            let cached = currentUserId ? chatCache.get<any>(cacheKey, currentUserId) : null;
            if (!cached) cached = chatCache.get<any>(cacheKey, undefined);

            if (cached) {
                return cached.data;
            }
        }
        return undefined;
    },
  });

  // 🔹 SSR HYDRATION GUARD: 
  // Renders a loader on both server and client (before mount)
  // This matches the server output exactly, avoiding hydration mismatch.
  // After mount, placeholderData (cached) or fetched data will take over.
  if (!mounted) {
    return <SlugPageSkeleton />;
  }

  if (!data && isLoading) {
    return <SlugPageSkeleton />;
  }

  const rawData = data as any;
  // Resiliency: Handle new format {course, enrollmentStatus...} or old raw course object
  const course = rawData?.course || (rawData?.id ? rawData : null);
  const enrollmentStatus = rawData?.enrollmentStatus || null;

  if (!course) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <h2 className="text-2xl font-bold">Course Not Found</h2>
            <p className="text-muted-foreground">The course you are looking for might have been moved or deleted.</p>
            <Link href="/courses" className={buttonVariants()}>Go Back to Courses</Link>
        </div>
    );
  }
  return (
    <>
      {/* Course Content */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-5 px-4 lg:px-6">
        <div className="order-1 lg:col-span-2">
          {/* Course Image */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-lg">
            <Image
              src={useConstructUrl(course.fileKey)}
              alt="Thumbnail"
              fill
              className="object-cover"
              priority
              crossOrigin="anonymous"
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
            </div>
          </div>
          <Separator className="my-8" />
          <div className="space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight">
              Course Description
            </h2>
            {/* Course Description */}
            <div>
              <RenderDescription json={course.description ? JSON.parse(course.description) : null} />
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
                    (total: number, chapter: any) => total + chapter.lesson.length,
                    0
                  ) || 0}
                </span>{" "}
                Lessons
              </div>
            </div>
            {/* Course Chapters */}
            <div className="space-y-4">
              {course.chapter.map((chapter: any, index: number) => (
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
                              <h3 className="text-xl font-semibold text-left">
                                {chapter.title}
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
                          {chapter.lesson.map((lesson: any, lessonIndex: number) => (
                            <div
                              key={lesson.id}
                              className="flex items-center gap-4 rounded-lg p-3 hover:bg-accent transition-colors group"
                            >
                              <div className="flex size-8 items-center justify-center rounded-full bg-background border-2 border-primary/20">
                                <IconPlayerPlay className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
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
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </div>
        </div>
        {/* Course Sidebar */}
        <div className="order-2 lg:col-span-1">
          <div className="sticky top-20 h-fit max-h-[calc(100vh-(--spacing(24)))] overflow-y-auto  pb-4 md:pb-0 scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent hover:scrollbar-thumb-primary/20 transition-colors">
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
                        value={course.level}
                      />

                      <FeatureRow
                        icon={<IconCategory className="size-4" />}
                        title="Category"
                        value={course.category}
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
                          (total: number, chapter: any) => total + chapter.lesson.length,
                          0
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
                        href={`/dashboard/${course.slug}`}
                      >
                        Watch Course
                      </Link>
                    ) : (
                      <EnrollmentButton
                        courseId={course.id}
                        slug={slug}
                        status={enrollmentStatus}
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
    </>
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
