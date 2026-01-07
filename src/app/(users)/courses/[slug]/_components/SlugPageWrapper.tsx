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
import { buttonVariants } from "@/components/ui/button";
import { env } from "@/lib/env";
import {
  IconBook,
  IconCategory,
  IconChartBar,
  IconChevronDown,
  IconClock,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { CheckIcon, TimerIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EnrollmentStatus, CourseLevel } from "@/generated/prisma";
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";
import { JSX } from "react";
import { EnrollmentButton } from "./EnrollmentButton";

interface SlugPageWrapperProps {
  course: {
    id: string;
    title: string;
    description: string;
    fileKey: string;
    duration: number;
    level: CourseLevel;
    category: string;
    smallDescription: string;
    slug: string;
    chapter: {
      id: string;
      title: string;
      lesson: {
        id: string;
        title: string;
      }[];
    }[];
  };
  enrollmentStatus: EnrollmentStatus | null;
  isProfileComplete: boolean;
}

export function SlugPageWrapper({
  course,
  enrollmentStatus,
  isProfileComplete,
}: SlugPageWrapperProps) {
  return (
    <>
      <PhoneNumberDialog isOpen={!isProfileComplete} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 mt-5 px-4 lg:px-6">
        <div className="order-1 lg:col-span-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-lg">
            <Image
              src={`https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${course.fileKey}`}
              alt="Thumbnail"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent"></div>
          </div>
          <div className="mt-8 space-y-6">
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight">
                {course.title}
              </h1>
              <p className="text-lg text-muted-foreground leading-6 line-clamp-2">
                {course.smallDescription}
              </p>
            </div>
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
            <div>
              <RenderDescription json={JSON.parse(course.description)} />
            </div>
          </div>
          <Separator className="mt-8 mb-6" />
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-semibold tracking-tight">
                Course Content
              </h2>
              <div>
                <span className="text-primary">{course.chapter.length}</span>{" "}
                chapters |{" "}
                <span className="text-primary">
                  {course.chapter.reduce(
                    (total, chapter) => total + chapter.lesson.length,
                    0
                  ) || 0}
                </span>{" "}
                Lessons
              </div>
            </div>
            <div className="space-y-4">
              {course.chapter.map((chapter, index) => (
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
                              className="text-sm rounded-sm"
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
                      <div className="border-t bg-muted/20">
                        <div className="p-6 pt-4 space-y-3">
                          {chapter.lesson.map((lesson, lessonIndex) => (
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
        <div className="order-2 lg:col-span-1">
          <div className="sticky top-20">
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
                          (total, chapter) => total + chapter.lesson.length,
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
                        status={enrollmentStatus}
                      />
                    )}
                    <Link
                      href="/courses"
                      className={buttonVariants({
                        variant: "outline",
                        className: "w-full mt-4",
                      })}
                    >
                      Go Back
                    </Link>
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
