"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Loader from "@/components/ui/Loader";

export function PageLoader() {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Prevent synchronous state update inside effect
    queueMicrotask(() => setLoading(true));

    const timer = setTimeout(() => setLoading(false), 300);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  return loading ? <Loader fullScreen text="Loading..." /> : null;
}
