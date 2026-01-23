import { getUserCourseDetailedProgress } from "@/app/admin/analytics/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Calendar, CheckCircle2, Clock, Mail, PlayCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ChapterExpansion } from "./_components/ChapterExpansion";
import { formatIST } from "@/lib/utils";

interface PageProps {
    params: Promise<{
        userId: string;
        courseId: string;
    }>;
}

export default async function UserCourseDetailedAnalyticsPage({ params }: PageProps) {
    const { userId, courseId } = await params;
    const data = await getUserCourseDetailedProgress(userId, courseId);

    if (!data) {
        notFound();
    }

    const { user, course } = data;

    const totalCourseSpent = course.chapter.reduce((acc: number, c: any) => 
        acc + c.lesson.reduce((lAcc: number, l: any) => 
            lAcc + (l.lessonProgress[0]?.actualWatchTime || 0), 0
        ), 0
    );

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) return `${h}H ${m}M ${s}S`;
        return `${m}M ${s}S`;
    };

    return (
        <div className="flex flex-col gap-8 p-4 lg:p-6 w-full  mx-auto">
            {/* Header & Breadcrumb */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                    <Link href="/admin/analytics" className="hover:text-primary transition-colors">Analytics</Link>
                    <span className="opacity-40">/</span>
                    <Link href="/admin/analytics/users" className="hover:text-primary transition-colors">Users</Link>
                    <span className="opacity-40">/</span>
                    <Link href={`/admin/analytics/users/${userId}`} className="hover:text-primary transition-colors">{user.name}</Link>
                    <span className="opacity-40">/</span>
                    <span className="text-foreground tracking-widest">{course.title}</span>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-5">
                        <Avatar className="size-20 border-4 border-primary/10 shadow-xl">
                            <AvatarImage src={user.image || ""} />
                            <AvatarFallback className="bg-primary/5 text-primary text-2xl font-black uppercase">
                                {user.name?.charAt(0) || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1">
                            <h1 className="text-3xl font-black tracking-tight uppercase leading-tight">{user.name}</h1>
                            <div className="flex flex-wrap items-center gap-4 mt-1">
                                <Badge variant="outline" className="rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest bg-primary/5 text-primary border-primary/20">
                                    {user.role || "User"}
                                </Badge>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                    <Mail className="size-3.5" />
                                    {user.email}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                    <Calendar className="size-3.5" />
                                    Joined {formatIST(user.createdAt)}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                    <Clock className="size-3.5" />
                                    Course Spent {Math.floor(totalCourseSpent / 60)} Mins
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Chapters & Lessons */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Course Content</h2>
                    <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground font-medium">
                        <span>{course.chapter.length} chapters</span>
                        <span className="text-muted-foreground/20">|</span>
                        <span>{course.chapter.reduce((acc: number, c: any) => acc + c.lesson.length, 0)} Lessons</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    {course.chapter.map((chapter) => (
                        <ChapterExpansion key={chapter.id} chapter={chapter}>
                            <div className="grid gap-3">
                                {chapter.lesson.map((lesson) => {
                                    const progress = lesson.lessonProgress[0];
                                    const isCompleted = progress?.completed;

                                    return (
                                        <div key={lesson.id} className="group/lesson">
                                            <div className="flex flex-row items-center justify-between py-4 px-2 rounded-xl hover:bg-muted/30 transition-all duration-300">
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className={`flex items-center justify-center size-10 rounded-full border shrink-0 transition-colors ${isCompleted ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/10 border-border/50 text-muted-foreground/30'}`}>
                                                        {isCompleted ? <CheckCircle2 className="size-5" /> : <PlayCircle className="size-5" />}
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <h4 className="font-bold text-sm text-foreground truncate">
                                                            {lesson.title}
                                                        </h4>
                                                        <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-6 mt-1.5">
                                                            <p className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider">
                                                                Lesson {lesson.position}
                                                            </p>
                                                            {progress && (
                                                                <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-6">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Progress</span>
                                                                        <span className="text-[10px] font-black text-foreground uppercase tracking-widest leading-none">{formatTime(progress.lastWatched)}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[9px] font-black text-primary uppercase tracking-widest">Actual Time Spent</span>
                                                                        <span className="text-[9px] font-black text-foreground uppercase tracking-widest leading-none">{formatTime(progress.actualWatchTime || 0)}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Last Watched</span>
                                                                        <span className="text-[10px] font-black text-foreground uppercase tracking-widest leading-none">
                                                                            {formatIST(progress.updatedAt)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 shrink-0">
                                                    {isCompleted ? (
                                                        <Badge className="bg-primary hover:bg-primary/90 text-white border-none rounded-full px-5 py-1 text-[10px] font-black uppercase tracking-widest min-w-[85px] justify-center shadow-md">
                                                            DONE
                                                        </Badge>
                                                    ) : progress ? (
                                                        <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5 rounded-full px-5 py-1 text-[10px] font-black uppercase tracking-widest min-w-[85px] justify-center">
                                                            ACTIVE
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-border text-muted-foreground/20 bg-muted/5 rounded-full px-5 py-1 text-[10px] font-black uppercase tracking-widest min-w-[85px] justify-center opacity-40">
                                                            PENDING
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ChapterExpansion>
                    ))}
                </div>
            </div>
        </div>
    );
}
