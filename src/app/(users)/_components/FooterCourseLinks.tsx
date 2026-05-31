"use client";
import { useEffect } from "react";
import Link from "next/link";

const CACHE_KEY = "footer_courses_v1";

interface CourseLink {
  id: string;
  title: string;
  slug: string;
}

export function FooterCourseLinks({
  courses: serverCourses,
}: {
  courses: CourseLink[];
}) {
  useEffect(() => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: serverCourses, timestamp: Date.now() }),
      );
    } catch {}
  }, [serverCourses]);

  return (
    <>
      {serverCourses.slice(0, 4).map((course) => (
        <li key={course.id}>
          <Link
            href={`/courses/${course.slug}`}
            className="text-muted-foreground hover:text-primary relative py-1 w-fit block text-sm transition-colors duration-300 group"
          >
            <span className="truncate max-w-[180px] block">{course.title}</span>
            <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
          </Link>
        </li>
      ))}
      {serverCourses.length === 0 && (
        <li className="text-muted-foreground/50 text-xs italic">
          No programs available yet
        </li>
      )}
      {serverCourses.length > 4 && (
        <li>
          <Link
            href="/courses"
            className="text-primary text-xs font-semibold hover:underline"
          >
            View all courses
          </Link>
        </li>
      )}
    </>
  );
}
