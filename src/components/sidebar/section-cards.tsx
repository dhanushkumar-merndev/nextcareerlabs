"use client"
import { useRef } from "react";
import { UserIcon } from "@/components/ui/user";
import { UsersIcon } from "@/components/ui/users";
import { BookTextIcon } from "@/components/ui/book-text";
import { PlayIcon } from "@/components/ui/play";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";

// Type for the stats passed from server component
interface SectionCardsProps {
  stats: {
    totalUsers: number;
    enrolledUsers: number;
    totalCourses: number;
    totalLessons: number;
  };
}

// Type for each card
interface SimpleCardProps {
  title: string;
  value: number | string;
  description: string;
  icon: React.ForwardRefExoticComponent<any>;
}

export function SectionCards({ stats }: SectionCardsProps) {
  const { totalUsers, enrolledUsers, totalCourses, totalLessons } = stats;

  return (
    <div className="grid grid-cols-2 gap-6 px-4 md:grid-cols-2 lg:grid-cols-4 lg:px-6">
      <SimpleStatCard
        title="Total Sign-Ups"
        value={totalUsers}
        description="Registered users on this platform"
        icon={UserIcon}
      />

      <SimpleStatCard
        title="Total Subscribers"
        value={enrolledUsers}
        description="Users who have enrolled in courses"
        icon={UsersIcon}
      />

      <SimpleStatCard
        title="Total Courses"
        value={totalCourses}
        description="Available courses on the platform"
        icon={BookTextIcon}
      />

      <SimpleStatCard
        title="Total Lessons"
        value={totalLessons}
        description="Total learning content available"
        icon={PlayIcon}
      />
    </div>
  );
}

function SimpleStatCard({ title, value, description, icon: Icon }: SimpleCardProps) {
  const iconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null);

  return (
    <Card
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className="
        group rounded-xl border bg-card
        transition-all duration-300
        hover:shadow-lg hover:-translate-y-1
        cursor-default
      "
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums mt-1">
            {value}
          </CardTitle>
        </div>

        {/* Animated Icon Container */}
        <div
          className="
            p-2 rounded-md bg-primary/10 
            transition-all duration-300
            group-hover:scale-110 group-hover:rotate-6 
            group-hover:bg-primary/20
          "
        >
          <Icon ref={iconRef} className="size-6 text-primary" size={24} />
        </div>
      </CardHeader>

      <CardFooter>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardFooter>
    </Card>
  );
}
