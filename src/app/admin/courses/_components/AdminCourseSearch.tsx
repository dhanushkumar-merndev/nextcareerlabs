"use client"
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function AdminCourseSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [value, setValue] = useState(searchParams.get("title") || "");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchParams.get("title") === value) return;

      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set("title", value);
      } else {
        params.delete("title");
      }

      router.replace(`${pathname}?${params.toString()}`);
    }, 800);

    return () => clearTimeout(timer);
  }, [value, router, pathname, searchParams]);

  return (
    <div className="relative w-full md:w-[300px]">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
