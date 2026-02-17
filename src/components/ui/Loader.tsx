import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoaderProps {
  className?: string;
  size?: number;
  fullScreen?: boolean;
}

export default function Loader({
  className,
  size = 32,
  fullScreen = false,
}: LoaderProps) {
  const content = (
    <div className={cn("flex items-center justify-center", className)}>
      <Loader2
        className="animate-spin text-primary"
        size={size}
      />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return content;
}
