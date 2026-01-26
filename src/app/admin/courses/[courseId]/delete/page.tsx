"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteCourse } from "./actions";
import { tryCatch } from "@/hooks/try-catch";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function DeleteCourseRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const { courseId } = useParams<{ courseId: string }>();

  function onSubmit() {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(deleteCourse(courseId));
      if (error) {
        toast.error("An unexpected error occurred. Please try again later");
        return;
      }
      if (result.status === "success") {
        toast.success(result.message);
        const { chatCache } = await import("@/lib/chat-cache");
        chatCache.invalidate("admin_courses_list");
        chatCache.invalidate("all_courses");
        
        // Invalidate React Query memory cache
        queryClient.invalidateQueries({ queryKey: ["admin_courses_list"] });
        queryClient.invalidateQueries({ queryKey: ["all_courses"] });

        router.push("/admin/courses");
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="max-w-xl mx-auto w-full">
      <Card className="mt-32">
        <CardHeader>
          <CardTitle>Are you sure you want to delete this course?</CardTitle>
          <CardDescription>This action cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/courses"
          >
            Cancel
          </Link>
          <Button
            variant={"destructive"}
            onClick={onSubmit}
            disabled={isPending}
            className="cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" /> Deleting...
              </>
            ) : (
              <>Delete</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
