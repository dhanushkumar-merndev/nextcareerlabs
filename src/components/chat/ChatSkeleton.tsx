import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquarePlus } from "lucide-react";

export function ChatSidebarSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background">
 
       
      <div className="space-y-2 p-2 mt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-2 flex-1 overflow-hidden">
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-3 w-[80%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatWindowSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`flex gap-3 max-w-[80%] ${
            i % 2 === 0 ? "ml-auto flex-row-reverse" : ""
          }`}
        >
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="space-y-1 w-full">
            <Skeleton
              className={`h-16 w-full rounded-2xl ${
                i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none"
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatEmptyStateSkeleton() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10 p-8 text-center">
            <div className="h-20 w-20 bg-muted/50 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <MessageSquarePlus className="h-10 w-10 opacity-20" />
            </div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
        </div>
    );
}
