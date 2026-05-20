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
import { PhoneNumberDialog } from "@/app/(users)/_components/PhoneNumberDialog";

export function EnrollmentButton({
  courseId,
  slug,
  status,
  isFree,
}: {
  courseId: string;
  slug?: string;
  status: string | null;
  isFree: boolean;
}) {
  const queryClient = useQueryClient();
  const { session } = useSmartSession();
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  function onSubmit() {
    if (isPending || currentStatus === "Pending") return;
    if (!session) {
      window.location.href = "/login?reason=enroll";
      return;
    }

    // If paid course and no phone, show dialog
    if (!isFree && !session?.user?.phoneNumber) {
      setShowPhoneDialog(true);
      return;
    }

    doEnroll();
  }

  function doEnroll() {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        enrollInCourseAction(courseId)
      );
      if (error) {
        toast.error("Failed to process request. Please try again later");
        return;
      }

      if (result.status === "success") {
        toast.success(result.message);
        setCurrentStatus(result.enrollmentStatus ?? "Pending");

        const uid = session?.user?.id;
        if (uid) {
          chatCache.setNeedsSync(uid);
          chatCache.invalidateUserDashboardData(uid);
          chatCache.invalidateAllCourseData();
          chatCache.invalidate(`user_enrolled_courses_${uid}`, uid);
          chatCache.invalidate(`available_courses_${uid}`, uid);
          chatCache.invalidate(`my_courses_${uid}`, uid);

          if (slug) {
            chatCache.invalidate(`course_${slug}`, uid);
            chatCache.invalidate(`course_${slug}`, undefined);
          }
        }

        setTimeout(() => {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0] as string;
              return key === "all_courses" ||
                key.startsWith("available_courses") ||
                key === "enrolled_courses" ||
                key === "user_dashboard" ||
                key === "chat_sidebar" ||
                key === "my_courses" ||
                key === "user_resources" ||
                key === "user_resources_access";
            }
          });

          if (slug && uid) {
            queryClient.invalidateQueries({ queryKey: ["course_detail", slug, uid] });
          }
        }, 50);
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  const isActuallyPending = currentStatus === "Pending";
  return (
    <>
      <Button
        onClick={onSubmit}
        disabled={isPending || isActuallyPending || currentStatus === "Pending" || currentStatus === "Rejected" || currentStatus === "Revoked"}
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

      <PhoneNumberDialog
        isOpen={showPhoneDialog}
        onSuccess={() => {
          setShowPhoneDialog(false);
          doEnroll();
        }}
      />
    </>
  );
}
