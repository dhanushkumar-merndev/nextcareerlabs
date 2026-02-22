"use client";

import { EnrolledCoursesType } from "@/app/data/user/get-enrolled-courses";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { CrownIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCourseProgress } from "@/hooks/use-course-progress";

interface iAppProps {
  data: EnrolledCoursesType;
  isPriority?: boolean;
}

export function CourseProgressCard({ data, isPriority = false }: iAppProps) {
  const course = data.Course;
  const thumbnailUrl = useConstructUrl(course.fileKey);

  const { completedLessons, totalLessons, progressPercentage } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useCourseProgress({ courseData: course as any });

  return (
    <Card className="group relative py-0 gap-0 hover:shadow-lg transition-all rounded-xl">
      {/* Level Badge */}
      <Badge className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <CrownIcon className="size-3" />
        {course.level}
      </Badge>

      {/* Thumbnail */}
      <Image
        src={thumbnailUrl}
        alt={course.title}
        width={600}
        height={400}
        style={{ height: "auto" }}
        className="w-full aspect-video h-full object-cover rounded-t-xl"
        priority={isPriority}
        loading={isPriority ? undefined : "lazy"}
        crossOrigin="anonymous"
      />

      <CardContent className="p-4 space-y-3">
        {/* Title */}
        <Link
          href={`/dashboard/${course.slug}`}
          className="font-medium text-lg line-clamp-2 hover:underline group-hover:text-primary transition-colors"
        >
          {course.title}
        </Link>

        {/* Description */}
        <p className="line-clamp-2 text-sm text-muted-foreground leading-tight">
          {course.smallDescription}
        </p>

        {/* Progress Bar */}
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {progressPercentage}% completed
          </p>

          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-1">
            {completedLessons} of {totalLessons} lessons completed
          </p>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/dashboard/${course.slug}`}
            className={buttonVariants({ className: "w-1/2 rounded-lg" })}
          >
            Watch Now
          </Link>

          <Link
            href={`/courses/${course.slug}`}
            className={buttonVariants({
              className: "w-1/2 rounded-lg",
              variant: "outline",
            })}
          >
            About
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* Skeleton */
export function EnrolledCourseCardSkeleton() {
  return (
    <Card className="group relative py-0 gap-0 rounded-xl">
      <div className="absolute top-2 right-2 z-10">
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>

      <Skeleton className="w-full aspect-video rounded-t-xl" />

      <CardContent className="p-4 space-y-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />

        <Skeleton className="h-2 w-full rounded-full" />

        <Skeleton className="h-10 w-full mt-4 rounded-md" />
      </CardContent>
    </Card>
  );
}
