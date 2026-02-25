"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function ErrorRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (error) {
      router.push(`/?error=${error}`);
    } else {
      router.push("/");
    }
  }, [error, router]);

  return null;
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorRedirect />
    </Suspense>
  );
}
