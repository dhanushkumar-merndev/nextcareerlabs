"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AuthErrorHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get("error");
    const description = searchParams.get("error_description") ?? "";

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

    if (isAccountLinkingError) {
      toast.error(
        "This email was registered with OTP. Please use email sign-in instead."
      );
    } else {
      toast.error(description || "Authentication failed. Please try again.");
    }

    // ✅ Clean the URL while staying on the current page
    // This removes ?error=... from the address bar
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    router.replace(url.pathname);
  }, [searchParams, router]);

  return null;
}
