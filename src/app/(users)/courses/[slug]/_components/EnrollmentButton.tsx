/**
 * EnrollmentButton Component
 *
 * - Handles course enrollment via API action
 * - Manages loading states and transitions
 * - Invalidates relevant caches on success
 * - Syncs enrollment status with local state
 */

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

// Enrollment Button Component
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
  const { session } = useSmartSession();
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status);
 // useEffect to sync status with local state
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
        
        // Invalidate both local storage and React Query memory cache
        chatCache.invalidate("all_courses", session?.user?.id);
        queryClient.invalidateQueries({ queryKey: ["all_courses", session?.user?.id] });

        // If slug provided, invalidate specific course detail
        if (slug) {
            chatCache.invalidate(`course_${slug}`, session?.user?.id);
            queryClient.invalidateQueries({ queryKey: ["course_detail", slug, session?.user?.id] });
        }
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }
  // Determine button state based on current status
  const isActuallyPending = currentStatus === "Pending";
// Return button with appropriate state and variant
  return (
    // Button component with loading states
    <Button
      onClick={onSubmit}
      disabled={isPending || currentStatus === "Pending" || currentStatus === "Rejected" || currentStatus === "Revoked"}
      className="w-full"
      variant={
        currentStatus === "Pending" ? "outline" : 
        (currentStatus === "Rejected" || currentStatus === "Revoked") ? "destructive" : 
        "default"
      }
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Loading...
        </>
      ) : currentStatus === "Pending" ? (
        "Pending Approval"
      ) : currentStatus === "Rejected" ? (
        "Request Rejected"
      ) : currentStatus === "Revoked" ? (
        "Access Revoked"
      ) : (
        "Request Access"
      )}
    </Button>
  );
}
