"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const routesToPreload = [
  "/",
  "/dashboard",
  "/login",
  "/verify-request",
  "/admin",
  "/courses",
  "/admin/courses",
  "/admin/courses/create",
];

export function PreloadPages() {
  const router = useRouter();

  useEffect(() => {
    routesToPreload.forEach((route) => router.prefetch(route));
  }, [router]);

  return null; // This component does not render anything
}
