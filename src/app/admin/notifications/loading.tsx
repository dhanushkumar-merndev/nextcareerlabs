import { ChatSidebarSkeleton, ChatEmptyStateSkeleton } from "@/components/chat/ChatSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] w-full overflow-hidden bg-background -mt-4">
       <div className="flex-1 p-4 md:p-6 h-full"> 
         <div className="flex h-full w-full overflow-hidden bg-background border rounded-xl shadow-sm">
            {/* Sidebar Skeleton */}
            <div className="w-full md:w-[350px] border-r flex flex-col h-full">
                <ChatSidebarSkeleton />
            </div>
            
            {/* Window Skeleton (Empty State) */}
            <div className="flex-1 hidden md:flex flex-col h-full bg-muted/10">
                <ChatEmptyStateSkeleton />
            </div>
         </div>
       </div>
    </div>
  );
}
