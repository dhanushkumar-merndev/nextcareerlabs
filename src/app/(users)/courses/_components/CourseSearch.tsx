/**
 * CourseSearch Component
 *
 * - Provides a debounced search input for courses
 * - Syncs search value with URL query param (?title=)
 * - Uses Next.js router.replace to avoid full page reload
 * - Debounce delay: 1000ms
 */

"use client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function CourseSearch() {
  // Access current URL search params
  const searchParams = useSearchParams();

  // Get current pathname (used to preserve route)
  const pathname = usePathname();

  // Next.js router instance
  const router = useRouter();

  // Local state synced with `title` query param
  const [value, setValue] = useState(searchParams.get("title") || "");

  // Debounced effect to update URL when input changes
  useEffect(() => {
    // Start debounce timer
    const timer = setTimeout(() => {
      // Clone existing search params
      const params = new URLSearchParams(searchParams);

      // Add or remove `title` param based on input value
      if (value) {
        params.set("title", value);
      } else {
        params.delete("title");
      }

      // Replace URL without reloading the page
      router.replace(`${pathname}?${params.toString()}`);
    }, 1000);

    // Cleanup timer on value change or unmount
    return () => clearTimeout(timer);
  }, [value, router, pathname, searchParams]);

  return (
    <div className="relative w-full md:w-[300px]">
      {/* Search icon */}
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

      {/* Search input */}
      <Input
        type="search"
        placeholder="Search courses..."
        className="w-full pl-8 bg-background rounded-xl"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}
