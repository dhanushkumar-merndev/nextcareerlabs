import { getUserAnalyticsAdmin } from "@/app/admin/analytics/actions";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Calendar, CheckCircle2, Clock, Mail, PlayCircle, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatIST } from "@/lib/utils";

interface PageProps {
    params: Promise<{ userId: string }>;
}

export default async function UserAnalyticsPage({ params }: PageProps) {
    const { userId } = await params;
    const data = await getUserAnalyticsAdmin(userId);

    if (!data) {
        notFound();
    }

    const { user, enrolledCoursesCount, completedCoursesCount, completedChaptersCount, coursesProgress } = data;

    // Calculate total lessons completed across all courses
    const totalLessonsCompleted = coursesProgress.reduce((acc: number, course: any) => acc + course.completedLessons, 0);
    const totalTimeSpent = coursesProgress.reduce((acc: number, course: any) => acc + course.actualWatchTime, 0);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) return `${h}H ${m}M ${s}S`;
        if (m > 0) return `${m}M ${s}S`;
        return `${s}S`;
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
                    <span className="text-foreground tracking-widest">{user.name}</span>
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
                            <h1 className="text-3xl font-black tracking-tight uppercase">{user.name}</h1>
                            <div className="flex flex-wrap items-center gap-3 mt-1">
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
                                    Spent {Math.floor(totalTimeSpent / 60)} Mins
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Separator className="bg-border/40" />

            {/* Overall Stats */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 lg:gap-6">
                <AnalyticsCard
                    title="Enrolled"
                    value={enrolledCoursesCount}
                    icon="book-text"
                    description="Active courses"
                />
                <AnalyticsCard
                    title="Completed"
                    value={completedCoursesCount}
                    icon="circle-check"
                    description="Fully finished"
                />
                <AnalyticsCard
                    title="Chapters"
                    value={completedChaptersCount}
                    icon="layers"
                    description="Milestones"
                />
                <AnalyticsCard
                    title="Lessons"
                    value={totalLessonsCompleted}
                    icon="clipboard-check"
                    description="Consumption"
                />
            </div>

            {/* Detailed Progress */}
            <div className="flex flex-col gap-6">
                <div>
                    <h2 className="text-xl font-bold tracking-tight uppercase text-foreground/80">Course Progress</h2>
                    <p className="text-sm text-muted-foreground">Detailed breakdown of learning progress for each course.</p>
                </div>

                {coursesProgress.length === 0 ? (
                    <Card className="border-dashed border-2 bg-muted/5 py-12">
                        <CardContent className="flex flex-col items-center justify-center text-center gap-4">
                            <div className="p-4 rounded-full bg-muted/20">
                                <BookOpen className="size-8 text-muted-foreground/40" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-bold uppercase tracking-tight text-muted-foreground">No active enrollments</p>
                                <p className="text-sm text-muted-foreground/60 max-w-[250px]">This user hasn't been granted access to any courses yet.</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {coursesProgress.map((course: any) => (
                            <Link 
                                key={course.id} 
                                href={`/admin/analytics/users/${userId}/${course.id}`}
                                className="block group active:scale-[0.99] transition-all"
                            >
                                <Card className="overflow-hidden border-border/40 group-hover:border-primary/40 group-hover:shadow-lg group-hover:bg-primary/5 transition-all duration-300">
                                <div className="flex flex-col md:flex-row md:items-center gap-6 px-8">
                                    {/* Course Thumbnail placeholder/derived */}
                                    <div className="w-full md:w-32 aspect-video rounded-lg bg-muted relative overflow-hidden shrink-0 border border-border/20">
                                        {course.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={`https://next-career-labs-assets.t3.storage.dev/${course.imageUrl}`}
                                                alt={course.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-primary/5">
                                                <BookOpen className="size-6 text-primary/40" />
                                            </div>
                                        )}
                                        <div className="absolute top-0 right-1">
                                            <Badge className="bg-background/80 backdrop-blur-sm text-[9px] font-black uppercase text-foreground border-border/20">
                                                {course.progress === 100 ? "Completed" : "In Progress"}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col gap-3">
                                        <div className="flex justify-between items-start gap-4">
                                            <div>
                                                <h3 className="font-bold text-lg leading-tight uppercase tracking-tight group-hover:text-primary transition-colors">
                                                    {course.title}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-1 font-medium">
                                                    {course.completedLessons} of {course.totalLessons} lessons completed
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xl font-black text-primary/80 tabular-nums">
                                                    {course.progress}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Progress value={course.progress} className="h-2.5 bg-primary/10" />
                                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                                <span>Beginner</span>
                                                <span>Mastery</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
