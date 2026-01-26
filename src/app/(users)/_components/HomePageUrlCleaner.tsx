/* This component is used to clean the URL after authentication error */

"use client";
import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

// Fetches the authentication error from the URL and shows it in a toast
export default function HomePage() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const msg = params.get("authError");
    if (msg) {
      toast.error(msg);
      // clean URL
      router.replace("/", { scroll: false });
    }
  }, [params, router]);

  return null;
}