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
import { Search, Loader2, X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function CourseSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [value, setValue] = useState(searchParams.get("title") || "");

  useEffect(() => {
    const urlValue = searchParams.get("title") || "";
    if (urlValue !== value && !isPending) {
      setValue(urlValue);
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentTitle = searchParams.get("title") || "";
      if (currentTitle === value) return;

      // Match admin constraint: only search if length is 0 or >= 3
      if (value && value.length < 3) return;

      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("title", value);
      } else {
        params.delete("title");
      }

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [value, router, pathname, searchParams]);

  const onClear = () => {
    setValue("");
  };

  return (
    <div className="relative w-full md:w-[320px] group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <Input
        type="text"
        placeholder="Search courses..."
        className="w-full pl-9 pr-9 bg-background/50 border-muted-foreground/20 rounded-xl focus:bg-background transition-all"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <button
            onClick={onClear}
            className="p-1 hover:bg-muted-foreground/10 rounded-full transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
