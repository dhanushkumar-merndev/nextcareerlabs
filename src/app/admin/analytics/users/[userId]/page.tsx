import { getUserAnalyticsAdmin } from "@/actions/analytics";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { CourseProgressCard } from "@/components/dashboard/CourseProgressCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookOpen, Calendar, CheckCircle, Mail, Shield, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function AdminUserAnalyticsPage(props: PageProps) {
  const params = await props.params;
  const data = await getUserAnalyticsAdmin(params.userId);

  if (!data) {
    notFound();
  }

  const { user } = data;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Student Progress</h2>
            <Button variant="outline" asChild>
                <Link href="/admin/users">Back to Users</Link>
            </Button>
      </div>

        {/* User Profile Header */}
      <div className="flex items-start space-x-4 p-6 border rounded-xl bg-card text-card-foreground shadow-sm">
        <Avatar className="h-20 w-20">
            <AvatarImage src={user.image || ""} alt={user.name} />
            <AvatarFallback>{user.name?.charAt(0) || "U"}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
            <h3 className="text-2xl font-bold">{user.name}</h3>
            <div className="flex items-center text-sm text-muted-foreground space-x-4">
              
                <span className="flex items-center"><Calendar className="mr-1 h-3 w-3"/> Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
        </div>
      </div>




      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Course Progress</h3>
        {data.coursesProgress.length === 0 ? (
            <p className="text-muted-foreground">User is not enrolled in any courses.</p>
        ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.coursesProgress.map((course) => (
                    // Reusing the card, but might want to disable the 'Resume' button link or make it point to admin course view if needed.
                    // For now, it links to course which admin can view anyway
                    <CourseProgressCard
                        key={course.id}
                        title={course.title}
                        progress={course.progress}
                        slug={course.slug}
                        completedLessons={course.completedLessons}
                        totalLessons={course.totalLessons}
                        hideResumeButton={true}
                    />
                ))}
            </div>
        )}
      </div>
    </div>
  );
}
