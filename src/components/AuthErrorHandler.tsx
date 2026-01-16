"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

interface AuthErrorHandlerProps {
  /** If true, redirects to /login without showing toast for account linking errors */
  skipAccountLinkingToast?: boolean;
}

export default function AuthErrorHandler({ skipAccountLinkingToast = false }: AuthErrorHandlerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const description = searchParams.get("error_description") || "";

    if (!error) return;

    // Check if this is an account linking error
    const isAccountLinkingError =
      description.toLowerCase().includes("linking") ||
      description.toLowerCase().includes("already exists") ||
      error.toLowerCase().includes("account");

    if (error === "banned") {
      toast.error(
        description ||
          "You have been banned from this application. Please contact support."
      );
      router.replace("/");
      return;
    }

    // Handle account linking errors (email OTP user trying Google sign-in)
    if (isAccountLinkingError) {
      if (skipAccountLinkingToast) {
        // Silently redirect to login - let login page handle the error
        router.replace(`/login?error=${error}&error_description=${encodeURIComponent(description)}`);
      } else {
        // Show toast and stay on login
        toast.error(
          "This email was registered with OTP. Please use email sign-in instead."
        );
        router.replace("/login");
      }
      return;
    }

    // Handle any other auth errors
    toast.error(description || "Authentication failed. Please try again.");
    router.replace("/login");
  }, [searchParams, router, skipAccountLinkingToast]);

  return null;
}
