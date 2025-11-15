import { z } from "zod";

export const courseLevels = ["Beginner", "Intermediate", "Advanced"] as const;

export const courseStatus = ["Draft", "Published", "Archived"] as const;

export const courseSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Title must be at least 3 characters" })
    .max(100, { message: "Title must be less than 100 characters" }),

  description: z
    .string()
    .min(3, { message: "Description must be at least 3 characters" }),

  fileKey: z.string().min(1, { message: "File must be selected" }),

  price: z.coerce.number().min(1, { message: "Price must be greater than 0" }),

  duration: z.coerce
    .number()
    .min(1, { message: "Duration must be greater than 0" })
    .max(500, { message: "Duration must be less than 500 characters" }),

  level: z.enum(courseLevels, { message: "Level must be selected" }),

  category: z.string(),

  smallDescription: z
    .string()
    .min(3, { message: "Description must be at least 3 characters" })
    .max(200, { message: "Description must be less than 200 characters" }),

  slug: z.string().min(3, { message: "Slug must be at least 3 characters" }),

  status: z.enum(courseStatus, { message: "Status must be selected" }),
});

// Form Type
export type CourseSchemaType = z.infer<typeof courseSchema>;
