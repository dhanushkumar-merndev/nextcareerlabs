"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface HorizontalCourseCardProps {
    course: {
        id: string;
        title: string;
        imageUrl: string;
        progress: number;
        totalLessons: number;
        completedLessons: number;
        slug: string;
        level: string;
    };
}

export function HorizontalCourseCard({ course }: HorizontalCourseCardProps) {
    const isCompleted = course.progress === 100;
    const thumbnailUrl = useConstructUrl(course.imageUrl);

    return (
        <div className="group relative flex flex-col md:flex-row md:items-center gap-8 p-4 px-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm transition-all duration-300 hover:bg-card/60 hover:border-primary/20">
            {/* Thumbnail */}
            <div className="relative w-full md:w-32 aspect-video rounded-xl overflow-hidden shrink-0 border border-border/20 shadow-md">
                <Image
                    src={thumbnailUrl}
                    alt={course.title}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    crossOrigin="anonymous"
                />
                <div className="absolute top-1 right-1">
                    <Badge className="bg-background/90 backdrop-blur-sm text-[8px] font-black uppercase text-foreground border-border/20 px-1.5 py-0">
                        {isCompleted ? "Completed" : "Active"}
                    </Badge>
                </div>
            </div>

            {/* Content info */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold tracking-tight text-foreground uppercase group-hover:text-primary transition-colors truncate">
                            {course.title}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground/60">
                            {course.completedLessons} of {course.totalLessons} lessons completed
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-xl font-black text-primary/80 italic tabular-nums">
                            {course.progress}%
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <Progress value={course.progress} className="h-2 bg-primary/10 shadow-[inner_0_1px_2px_rgba(0,0,0,0.1)]" />
                    <div className="flex items-center justify-between px-0.5">
                        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
                            {course.level}
                        </span>
                        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">
                            Mastery
                        </span>
                    </div>
                </div>
            </div>

            {/* Action */}
            <div className="shrink-0 flex md:flex-col justify-end">
                <Button asChild size="sm" className="rounded-full px-8 font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 h-10 w-full md:w-auto">
                    <Link href={`/dashboard/${course.slug}`}>
                        <Play className="size-3 mr-2 fill-current" />
                        {course.progress > 0 ? (isCompleted ? "Review" : "Resume") : "Start"}
                    </Link>
                </Button>
            </div>
        </div>
    );
}
