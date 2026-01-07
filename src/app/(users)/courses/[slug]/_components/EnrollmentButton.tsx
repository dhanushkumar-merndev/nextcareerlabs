"use client";

import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useTransition, useState, useEffect } from "react";
import { enrollInCourseAction } from "../actions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function EnrollmentButton({
  courseId,
  status,
}: {
  courseId: string;
  status: string | null;
}) {
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
