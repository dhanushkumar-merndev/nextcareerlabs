"use client";

import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useTransition, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { enrollInCourseAction } from "../actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { chatCache } from "@/lib/chat-cache";
import { useSmartSession } from "@/hooks/use-smart-session";

export function EnrollmentButton({
  courseId,
  slug,
  status,
}: {
  courseId: string;
  slug?: string;
  status: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSmartSession();
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  function onSubmit() {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        enrollInCourseAction(courseId)
      );
      if (error) {
        toast.error("An unexpected error occurred. Please try again later");
        return;
      }
      if (result.status === "success") {
        toast.success(result.message);
        setCurrentStatus("Pending");
        
        // 🔹 Invalidate both local storage and React Query memory cache
        chatCache.invalidate("all_courses", session?.user?.id);
        queryClient.invalidateQueries({ queryKey: ["all_courses", session?.user?.id] });

        // 🔹 If slug provided, invalidate specific course detail
        if (slug) {
            chatCache.invalidate(`course_${slug}`, session?.user?.id);
            queryClient.invalidateQueries({ queryKey: ["course_detail", slug, session?.user?.id] });
        }
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  const isActuallyPending = currentStatus === "Pending";

  return (
    <Button
      onClick={onSubmit}
      disabled={isPending || isActuallyPending}
      className="w-full"
      variant={isActuallyPending ? "outline" : "default"}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Loading...
        </>
      ) : isActuallyPending ? (
        "Pending Approval"
      ) : (
        "Request Access"
      )}
    </Button>
  );
}
