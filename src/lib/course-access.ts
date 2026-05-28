export type CourseAccessInput = {
  isAdmin?: boolean;
  enrollmentStatus?: string | null;
  isFree?: boolean | null;
  freeChaptersCount?: number | null;
  chapterPosition?: number | null;
};

export function hasDemoAccess(input: CourseAccessInput) {
  const demoChapters = input.freeChaptersCount ?? 0;

  return Boolean(
    input.isFree &&
      demoChapters > 0 &&
      input.chapterPosition &&
      input.chapterPosition <= demoChapters,
  );
}

export function hasCourseContentAccess(input: CourseAccessInput) {
  return Boolean(
    input.isAdmin ||
      input.enrollmentStatus === "Granted" ||
      hasDemoAccess(input),
  );
}
