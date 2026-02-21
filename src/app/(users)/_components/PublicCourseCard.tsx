/* This component is used to display the public course card */

"use client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { CrownIcon, School, TimerIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CoursesProps } from "@/lib/types/course";

// PublicCourseCard component
export function PublicCourseCard({ data, enrollmentStatus = null, isPriority = false }: CoursesProps & { isPriority?: boolean }) {
  const thumbnaiUrl = useConstructUrl(data.fileKey || "");
  return (
    <Card className="group relative py-0 gap-0">
      {/* Badge */}
      <Badge className="absolute top-2 right-2 z-10">
        <CrownIcon className="size-2" />
        {data.level}
      </Badge>
      <Image
      src={thumbnaiUrl}
      alt={data.title}
      width={600}
      height={400}
      className="w-full aspect-video h-full object-cover rounded-t-lg"
      priority={isPriority}
      loading={isPriority ? undefined : "lazy"}
    />

      <CardContent className="p-4">
        <Link
          className="font-medium text-lg line-clamp-2 hover:underline group-hover:text-primary transition-colors"
          href={`/courses/${data.slug}`}
        >
          {data.title}
        </Link>
        <p className="line-clamp-2 text-sm text-muted-foreground leading-tight mt-2">
          {data.smallDescription}
        </p>
        <div className="mt-4 flex items-center gap-x-5">
          <div className="flex items-center gap-x-2">
            <TimerIcon className="size-6 p-1 rounded-md text-primary bg-primary/10" />
            <p className="text-sm text-muted-foreground">{data.duration}h</p>
          </div>
          <div className="flex items-center gap-x-2">
            <School className="size-6 p-1 rounded-md text-primary bg-primary/10" />
            <p className="text-sm text-muted-foreground">{data.category}</p>
          </div>
        </div>
        {enrollmentStatus === "Granted" ? (
          <div className="mt-4 flex items-center gap-2">
            <Link
              href={`/dashboard/${data.slug}`}
              className={buttonVariants({ className: "w-1/2" })}
            >
              Watch Now
            </Link>

            <Link
              href={`/courses/${data.slug}`}
              className={buttonVariants({
                className: "w-1/2",
                variant: "outline",
              })}
            >
              Learn More
            </Link>
          </div>
        ) : (
          <Link
            href={`/courses/${data.slug}`}
            className={buttonVariants({
              className: "w-full mt-4",
              variant: 
                enrollmentStatus === "Pending" ? "secondary" : 
                (enrollmentStatus === "Rejected" || enrollmentStatus === "Revoked") ? "destructive" : 
                "default",
            })}
          >
            {enrollmentStatus === "Pending" ? "Pending Approval" : 
             enrollmentStatus === "Rejected" ? "Request Rejected" :
             enrollmentStatus === "Revoked" ? "Access Revoked" :
             "Learn More"}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// PublicCourseCardSkeleton component
export function PublicCourseCardSkeleton() {
  return (
    <Card className="group relative py-0 gap-0">
      <div className="absolute top-2 right-2 z-10">
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>

      <Skeleton className="w-full aspect-video rounded-t-lg" />

      <CardContent className="p-4 space-y-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />

        <div className="mt-4 flex items-center gap-x-5">
          <div className="flex items-center gap-x-2">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="flex items-center gap-x-2">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        <Skeleton className="h-10 w-full mt-4 rounded-md" />
      </CardContent>
    </Card>
  );
}
