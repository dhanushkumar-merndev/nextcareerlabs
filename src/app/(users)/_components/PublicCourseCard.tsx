/* eslint-disable @next/next/no-img-element */
/* This component is used to display the public course card */

"use client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { constructUrl } from "@/hooks/use-construct-url";
import { CrownIcon, Loader2, School, TimerIcon } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { CoursesProps } from "@/lib/types/course";
import { useSmartSession } from "@/hooks/use-smart-session";
import { useQueryClient } from "@tanstack/react-query";
import { useTransition, useState } from "react";
import { enrollInCourseAction } from "@/app/(users)/courses/[slug]/actions";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import { chatCache } from "@/lib/chat-cache";
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";

// PublicCourseCard component
export function PublicCourseCard({
  data,
  enrollmentStatus = null,
}: CoursesProps) {
  const { session } = useSmartSession();
  const queryClient = useQueryClient();
  const isLoggedIn = !!session?.user?.id;
  const thumbnaiUrl = constructUrl(data.fileKey || "");
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);

  const displayStatus = localStatus ?? enrollmentStatus;

  function onEnroll() {
    if (isPending) return;
    if (!session?.user?.id) {
      window.location.assign(`/login?redirect=/courses/${data.slug}`);
      return;
    }
    if (!data.isFree && !session?.user?.phoneNumber) {
      setShowPhoneDialog(true);
      return;
    }
    doEnroll();
  }

  function doEnroll() {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        enrollInCourseAction(data.id)
      );
      if (error) {
        toast.error("Failed to enroll. Please try again later");
        return;
      }

      if (result.status === "success") {
        toast.success(result.message);
        setLocalStatus(result.enrollmentStatus ?? "Granted");

        const uid = session!.user.id;
        chatCache.setNeedsSync(uid);
        chatCache.invalidateUserDashboardData(uid);
        chatCache.invalidateAllCourseData();
        chatCache.invalidate(`user_enrolled_courses_${uid}`, uid);
        chatCache.invalidate(`available_courses_${uid}`, uid);
        chatCache.invalidate(`course_${data.slug}`, uid);
        chatCache.invalidate(`course_${data.slug}`, undefined);

        setTimeout(() => {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0] as string;
              return key === "all_courses" ||
                key.startsWith("available_courses") ||
                key === "enrolled_courses" ||
                key === "user_dashboard" ||
                key === "chat_sidebar" ||
                key === "my_courses" ||
                key === "user_resources" ||
                key === "user_resources_access";
            },
          });
        }, 50);
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Card className="group relative py-0 gap-0 shadow-lg border border-border/50 rounded-lg h-full flex flex-col overflow-hidden">
      {/* Badge */}
      <Badge className="absolute top-2 right-2 z-10">
        <CrownIcon className="size-2" />
        {data.level}
      </Badge>

      {/* Animated Thumbnail Container */}
      <div className="relative w-full aspect-video overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full h-full"
        >
          <img
            src={thumbnaiUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop"}
            alt={data.title}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop";
            }}
          />
        </motion.div>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col">
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
            <p className="text-sm text-muted-foreground">
              {Math.round((data.duration || 0) / 3600)}h
            </p>
          </div>
          <div className="flex items-center gap-x-2">
            <School className="size-6 p-1 rounded-md text-primary bg-primary/10" />
            <p className="text-sm text-muted-foreground">{data.category}</p>
          </div>
          {data.isFree ? (
            <Badge variant="outline" className="border-primary text-primary bg-transparent hover:bg-transparent">
              Free
            </Badge>
          ) : null}
        </div>
        <div className="mt-auto pt-4">
          {displayStatus === "Granted" ? (
            <div className="flex items-center gap-2">
              <Link
                href={isLoggedIn ? `/dashboard/${data.slug}` : `/login?redirect=/dashboard/${data.slug}`}
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
          ) : !displayStatus ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={onEnroll}
                disabled={isPending}
                className="w-1/2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading...
                  </>
                ) : data.isFree ? (
                  "Enroll Now"
                ) : (
                  "Request Access"
                )}
              </Button>

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
                className: "w-full",
                variant:
                  displayStatus === "Pending"
                    ? "secondary"
                    : displayStatus === "Rejected" ||
                        displayStatus === "Revoked"
                      ? "destructive"
                      : "default",
              })}
            >
              {displayStatus === "Pending"
                ? "Pending Approval"
                : displayStatus === "Rejected"
                  ? "Request Rejected"
                  : displayStatus === "Revoked"
                    ? "Access Revoked"
                    : "Learn More"}
            </Link>
          )}
        </div>
      </CardContent>
      </Card>

      <PhoneNumberDialog
        isOpen={showPhoneDialog}
        onSuccess={() => {
          setShowPhoneDialog(false);
          doEnroll();
        }}
      />
    </>
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
