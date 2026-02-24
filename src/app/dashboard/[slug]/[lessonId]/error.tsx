"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function LessonError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[LessonPage Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center gap-4 min-h-[50vh]">
      <AlertTriangle className="size-16 text-destructive/40" />
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        An error occurred while loading this lesson. This is usually temporary.
      </p>
      <Button onClick={reset} variant="outline" className="gap-2 mt-2">
        <RefreshCw className="size-4" />
        Try Again
      </Button>
    </div>
  );
}
