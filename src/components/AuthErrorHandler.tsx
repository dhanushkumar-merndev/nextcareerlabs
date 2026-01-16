"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AuthErrorHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const description = searchParams.get("error_description") || "";

    if (error === "banned") {
      toast.error(
        description ||
          "You have been banned from this application. Please contact support."
      );
      router.replace("/");
      return;
    }

    // Handle account linking errors (email OTP user trying Google sign-in)
    if (
      error &&
      (description.toLowerCase().includes("linking") ||
        description.toLowerCase().includes("already exists") ||
        error.toLowerCase().includes("account"))
    ) {
      toast.error(
        "This email was registered with OTP. Please use email sign-in instead."
      );
      router.replace("/login");
      return;
    }

    // Handle any other auth errors
    if (error) {
      toast.error(description || "Authentication failed. Please try again.");
      router.replace("/login");
    }
  }, [searchParams, router]);

  return null;
}
