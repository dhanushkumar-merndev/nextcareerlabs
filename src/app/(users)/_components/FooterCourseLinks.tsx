"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const CACHE_KEY = "footer_courses_v1";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

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
  const [courses, setCourses] = useState(serverCourses);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL) {
          setCourses(data);
          return;
        }
      }
    } catch {}

    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data: serverCourses, timestamp: Date.now() }),
      );
    } catch {}
  }, [serverCourses]);

  return (
    <>
      {courses.slice(0, 4).map((course) => (
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
      {courses.length === 0 && (
        <li className="text-muted-foreground/50 text-xs italic">
          No programs available yet
        </li>
      )}
      {courses.length > 4 && (
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
