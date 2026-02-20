"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportTicketDialog } from "@/app/(users)/_components/SupportTicketDialog";
import { getThreadsAction } from "@/app/data/notifications/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { chatCache, getSidebarKey, getSidebarLocalKey } from "@/lib/chat-cache";

interface ChatLayoutProps {
   isAdmin: boolean;
   currentUserId: string;
}

export function ChatLayout({ isAdmin, currentUserId }: ChatLayoutProps) {
   const queryClient = useQueryClient();
   const [selectedThread, setSelectedThread] = useState<{ id: string; name: string; image?: string; type?: string } | null>(null);
   const [removedThreadIds, setRemovedThreadIds] = useState<string[]>([]);
   const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
   const lastVersionRef = useRef<number | null>(null);
   const [mounted, setMounted] = useState(false);

   useEffect(() => {
       setMounted(true);

       // 🟢 Robust LOCAL HIT Logging for Console
       const localKey = getSidebarLocalKey(isAdmin);
       const cached = chatCache.get<any>(localKey, isAdmin ? undefined : currentUserId);
       if (cached) {
           console.log(`[ChatLayout] LOCAL HIT (v${cached.version}). Rendering from device storage.`);
       }

       // Cross-Tab Sync: Listen for storage changes from other tabs
       const handleStorageChange = (e: StorageEvent) => {
           const localKey = getSidebarLocalKey(isAdmin);
           if (e.key?.includes(localKey)) {
               console.log(`[Chat] Cross-Tab Sync: Storage updated. Refetching...`);
               queryClient.invalidateQueries({ queryKey: getSidebarKey(currentUserId, isAdmin) });
           }
       };
       window.addEventListener('storage', handleStorageChange);
       return () => window.removeEventListener('storage', handleStorageChange);
   }, [currentUserId, isAdmin, queryClient]);

   const getTime = () => new Date().toLocaleTimeString();

   // Centralized Data Fetch (Threads + Courses + Version)
   const { data: sidebarData, isLoading } = useQuery({
  queryKey: getSidebarKey(currentUserId, isAdmin),

  queryFn: async () => {
    const localKey = getSidebarLocalKey(isAdmin);

    const cached = chatCache.get<any>(
      localKey,
      isAdmin ? undefined : currentUserId
    );

    const clientVersion = cached?.version;

    if (!cached) {
      console.log(`[${getTime()}] [Chat] Cache MISS. Fetching...`);
    }

    const result = await getThreadsAction(clientVersion);

    // If server says no change → use cache
    if ((result as any)?.status === "not-modified" && cached) {
      return cached.data;
    }

    // If new data received → update cache
    if (result && !(result as any)?.status) {
      console.log(
        `[${getTime()}] [Chat] NEW_DATA → Updating cache`
      );

      chatCache.set(
        localKey,
        result,
        isAdmin ? undefined : currentUserId,
        result.version,
        2592000000 // 30 Days
      );

      return result;
    }

    return cached?.data || null;
  },

  initialData: () => {
    if (typeof window === "undefined") return undefined;

    const localKey = getSidebarLocalKey(isAdmin);

    const cached = chatCache.get<any>(
      localKey,
      isAdmin ? undefined : currentUserId
    );

    if (cached) {
      return cached.data;
    }

    return undefined;
  },

  // 30-minute version check (Heartbeat)
  staleTime: 1800000, 
  refetchInterval: 1800000,
  refetchOnWindowFocus: true,
});

   const threads = (sidebarData as any)?.threads || [];
   const version = (sidebarData as any)?.version;


   // Group initialization is now handled more efficiently inside getThreadsAction

   // Version tracking (for potential real-time sync later)
   useEffect(() => {
      if (version !== undefined && version !== null) {
         lastVersionRef.current = version;
      }
   }, [version]);

   const handleRemoveThread = (threadId: string) => {
      setRemovedThreadIds(prev => [...prev, threadId]);
      setSelectedThread(null);
   };


   // Memoize handleSelectThread to prevent auto-select effect from running repeatedly
   // Also sync URL when user manually selects a thread
   const handleSelectThread = useCallback((thread: { id: string; name: string; image?: string; type?: string }) => {
      setSelectedThread(thread);

      // Silent URL update to avoid redundant server-side render
      const url = new URL(window.location.href);
      url.searchParams.set("threadId", thread.id);
      window.history.replaceState(null, "", url.toString());
   }, []);

   // Custom hook or simple check for mobile
   // For simplicity, using CSS display logic mostly, but state helps for "view" mode
   const isMobile = false; // We can use a real hook, or better, just render conditionally with CSS

   return (
      <div className="flex h-full w-full overflow-hidden bg-background border rounded-xl shadow-sm">
         {/* SIDEBAR - Hidden on mobile if thread selected */}
         <div className={`w-full md:w-[350px] border-r flex flex-col h-full min-h-0 overflow-hidden ${selectedThread ? 'hidden md:flex' : 'flex'}`}>
            {/* Sidebar Header with New Ticket Action for Users */}
            {!isAdmin && (
               <div className="p-4 border-b bg-muted/20 shrink-0">
                  <Button className="w-full gap-2" onClick={() => setIsNewTicketOpen(true)}>
                     <MessageSquarePlus className="h-4 w-4" />
                     New Support Ticket
                  </Button>
               </div>
            )}
            <ChatSidebar
               selectedThreadId={selectedThread?.id || null}
               onSelectThread={handleSelectThread}
               removedIds={removedThreadIds}
               threads={threads}
               loading={isLoading}
               currentUserId={currentUserId}
               isAdmin={isAdmin}
            />
         </div>

         {/* CHAT WINDOW - Hidden on mobile if NO thread selected */}
         <div className={`flex-1 flex flex-col h-full min-h-0 overflow-hidden ${!selectedThread ? 'hidden md:flex' : 'flex'}`}>
            {selectedThread ? (
               <div className="flex flex-col h-full min-h-0 overflow-hidden relative">

                  <ChatWindow
                     key={selectedThread.id}
                     threadId={selectedThread.id}
                     title={selectedThread.name}
                     avatarUrl={selectedThread.image}
                     isGroup={selectedThread.type === "Group"}
                     isAdmin={isAdmin}
                     currentUserId={currentUserId}
                     onRemoveThread={handleRemoveThread}
                     onBack={() => setSelectedThread(null)}
                     externalPresence={(sidebarData as any)?.presence || null}
                  />
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10 p-8 text-center">
                  <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
                     <MessageSquarePlus className="h-10 w-10 opacity-50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Select a Conversation</h3>
                  <p className="max-w-xs mt-2">
                     Choose a chat from the sidebar to start messaging {isAdmin ? "with a user" : "with support"}.
                  </p>
               </div>
            )}
         </div>

            <SupportTicketDialog 
               open={isNewTicketOpen} 
               onOpenChange={setIsNewTicketOpen} 
               courses={(sidebarData as any)?.enrolledCourses || []}
               userId={currentUserId}
            />
      </div>
   );
}
