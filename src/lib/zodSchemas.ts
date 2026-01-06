import { z } from "zod";

export const courseLevels = ["Beginner", "Intermediate", "Advanced"] as const;

export const courseStatus = ["Draft", "Published", "Archived"] as const;

export const courseCategories = [
  "Development",
  "Business",
  "Finance",
  "IT and Softwares",
  "Office productivity",
  "Personal Development",
  "Design",
  "Marketing",
  "Health & Fitness",
  "Music",
  "Teaching",
] as const;

export const courseSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Title must be at least 3 characters" })
    .max(100, { message: "Title must be less than 100 characters" }),

  description: z
    .string()
    .min(3, { message: "Description must be at least 3 characters" }),

  fileKey: z.string().min(1, { message: "File must be selected" }),

  duration: z
    .number()
    .min(1, { message: "Duration must be greater than 0" })
    .max(500, { message: "Duration must be less than 500 characters" }),

  level: z.enum(courseLevels, { message: "Level must be selected" }),

  category: z.enum(courseCategories, { message: "Category is required" }),

  smallDescription: z
    .string()
    .min(3, { message: "Description must be at least 3 characters" })
    .max(200, { message: "Description must be less than 200 characters" }),

  slug: z.string().min(3, { message: "Slug must be at least 3 characters" }),

  status: z.enum(courseStatus, { message: "Status must be selected" }),
});

export const chapterSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  courseId: z.string().uuid({ message: "Invalid course ID" }),
});

export const lessonSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  chapterId: z.string().uuid({ message: "Invalid chapter ID" }),
  courseId: z.string().uuid({ message: "Invalid course ID" }),
  description: z
    .string()
    .min(3, { message: "Description must be at least 3 characters" })
    .optional(),
  thumbnailKey: z
    .string()
    .min(1, { message: "Thumbnail must be selected" })
    .optional(),
  videoKey: z.string().min(1, { message: "Video must be selected" }).optional(),
});

export type CourseSchemaType = z.infer<typeof courseSchema>;
export type ChapterSchemaType = z.infer<typeof chapterSchema>;
export type LessonSchemaType = z.infer<typeof lessonSchema>;
