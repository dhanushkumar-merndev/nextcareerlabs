import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import { z } from "zod";

export function getFirstFormErrorMessage<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  fallback = "Please fix the highlighted fields",
) {
  const [firstError] = Object.values(errors);

  return typeof firstError?.message === "string"
    ? firstError.message
    : fallback;
}

export function safeZodResolver<TFieldValues extends FieldValues>(
  schema: z.ZodType<TFieldValues>,
): Resolver<TFieldValues> {
  return async (values) => {
    const validation = schema.safeParse(values);

    if (validation.success) {
      return {
        values: validation.data,
        errors: {},
      };
    }

    const errors: Record<string, { type: string; message: string }> = {};

    for (const issue of validation.error.issues) {
      const fieldName = issue.path[0]?.toString();

      if (fieldName && !errors[fieldName]) {
        errors[fieldName] = {
          type: issue.code,
          message: issue.message,
        };
      }
    }

    return {
      values: {},
      errors: errors as FieldErrors<TFieldValues>,
    };
  };
}
