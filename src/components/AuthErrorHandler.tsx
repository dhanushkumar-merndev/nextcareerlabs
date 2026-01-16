"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AuthErrorHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const description = searchParams.get("error_description");

    if (error === "banned") {
      toast.error(
        description ??
          "You have been banned from this application. Please contact support."
      );

      // ✅ Clean the URL after showing message
      router.replace("/");
    }
  }, [searchParams, router]);

  return null; // no UI
}
