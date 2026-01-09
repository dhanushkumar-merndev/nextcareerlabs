import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

interface CourseProgressCardProps {
  title: string;
  progress: number;
  slug: string;
  completedLessons: number;
  totalLessons: number;
  hideResumeButton?: boolean;
}

export function CourseProgressCard({ 
    title, 
    progress, 
    slug, 
    completedLessons, 
    totalLessons,
    hideResumeButton = false 
}: CourseProgressCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium line-clamp-1" title={title}>
            {title}
        </CardTitle>
        <span className="text-xs font-bold text-muted-foreground">{progress}%</span>
      </CardHeader>
      <CardContent>
        <Progress value={progress} className="h-2" />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{completedLessons} / {totalLessons} Lessons</span>
            {!hideResumeButton && (
                <Button asChild size="sm" variant="ghost" className="h-auto p-0 px-2">
                    <Link href={`/dashboard/${slug}`}>
                        {progress === 100 ? "Review" : "Resume"}
                    </Link>
                </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
