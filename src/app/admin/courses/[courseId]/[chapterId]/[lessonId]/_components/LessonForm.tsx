"use client";

import { AdminLessonType } from "@/app/data/admin/admin-get-lesson";

interface iAppProps {
  data: AdminLessonType;
  chapterId: string;
}

export function LessonForm({ data, chapterId }: iAppProps) {
  return (
    <div>
      Lesson Form for {data.title} in chapter {chapterId}
    </div>
  );
}
