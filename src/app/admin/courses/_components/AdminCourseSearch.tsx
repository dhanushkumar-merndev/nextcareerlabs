"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function AdminCourseSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [value, setValue] = useState(() => searchParams.get("title") || "");

  const syncToUrl = (val: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (val) {
        params.set("title", val);
      } else {
        params.delete("title");
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 1000);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    syncToUrl(val);
  };

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
        onChange={onChange}
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
