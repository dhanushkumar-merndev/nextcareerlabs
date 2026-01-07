"use client";

import { useState, useEffect, useRef } from "react";
import { getThreadsAction } from "@/app/data/notifications/actions";
import { chatCache } from "@/lib/chat-cache";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { useSearchParams } from "next/navigation";


import { ChatSidebarSkeleton } from "./ChatSkeleton";

interface ChatSidebarProps {
  selectedThreadId: string | null;
  onSelectThread: (thread: { id: string; name: string; image?: string; type?: string }) => void;
  isAdmin: boolean;
  removedIds?: string[];
}

export function ChatSidebar({ selectedThreadId, onSelectThread, isAdmin, removedIds = [] }: ChatSidebarProps) {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Groups" | "Tickets" | "Resolved">("All");
  const searchParams = useSearchParams();
  const urlThreadId = searchParams.get("threadId");

  const getAvatarUrl = (url?: string) => {
      if (!url) return "";
      if (url.startsWith("http") || url.startsWith("/")) return url;
      return useConstructUrl(url);
  };

  const initialized = useRef(false);

  useEffect(() => {
    // Synchronous check to strictly prevent double-invocation
    if (!initialized.current) {
        initialized.current = true;
        fetchThreads();
    }
    
    // Check URL params for deep linking (only once on mount)
    // We can move this logic inside the fetchThreads success or a separate effect that depends on threads
    
    const interval = setInterval(() => {
        fetchThreads();
    }, 600000); // Poll every 10 mins
    
    return () => clearInterval(interval);
  }, []);

  const fetchThreads = async () => {
    // Check cache first
    const cached = chatCache.get("threads");
    if (cached) {
        setThreads(cached);
        setLoading(false);
        // We still fetch in background to keep it fresh, or just skip if user wants strict 10min?
        // User said: "show that first api call infor after 10 min new one"
        // This implies: DON'T fetch if cached.
        return;
    }

    try {
      const data = await getThreadsAction();
      setThreads(data);
      chatCache.set("threads", data);
    } catch (e) {
      console.error("Failed to fetch threads");
    } finally {
      setLoading(false);
    }
  };

  // Auto-select thread from URL
  useEffect(() => {
     if (urlThreadId && threads.length > 0 && !selectedThreadId) {
         const thread = threads.find(t => t.threadId === urlThreadId);
         if (thread) {
             onSelectThread({
                 id: thread.threadId,
                 name: thread.display.name,
                 image: thread.display.image,
                 type: thread.type
             });
         }
     }
  }, [urlThreadId, threads, selectedThreadId, onSelectThread]);

  const filteredThreads = threads.filter(t => {
    const matchesSearch = t.display.name.toLowerCase().includes(search.toLowerCase()) ||
                          t.lastMessage.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filter === "All") return true;
    if (filter === "Groups") return t.isGroup;
    if (filter === "Tickets") return !t.isGroup && !t.resolved; // Open tickets
    if (filter === "Resolved") return !t.isGroup && t.resolved; // Resolved tickets only (No groups)
    
    // Optimistic removal filter
    if (removedIds.includes(t.threadId)) return false;
    
    return true;
  });

  return (
    <div className="w-full md:w-[350px] border-r flex flex-col h-full bg-background">
      <div className="p-4 border-b space-y-4">
         <div className="flex items-center justify-between px-2">
            <h2 className="font-bold text-lg">Messages</h2>

         </div>
         <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search chat..." 
              className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
         </div>
         
         {/* Filter Chips */}
         <div className="flex bg-muted/30 p-1 rounded-lg gap-1">
             {["All", "Groups", "Tickets", "Resolved"].map((f) => (
                 <button
                    key={f}
                    onClick={() => setFilter(f as any)}
                    className={cn(
                        "flex-1 text-[10px] py-1.5 rounded-md font-medium transition-all text-center",
                        filter === f ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                    )}
                 >
                    {f}
                 </button>
             ))}
         </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
         {loading ? (
            <ChatSidebarSkeleton />
         ) : filteredThreads.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground text-sm">No messages yet</div>
         ) : (
            filteredThreads.map(thread => (
              <button
                key={thread.threadId}
                onClick={() => onSelectThread({
                    id: thread.threadId,
                    name: thread.display.name,
                    image: thread.display.image,
                    type: thread.type
                })}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left",
                  selectedThreadId === thread.threadId ? "bg-primary/10" : "hover:bg-muted"
                )}
              >
                <Avatar className="h-10 w-10 border bg-background">
                  <AvatarImage src={getAvatarUrl(thread.display.image)} />
                  <AvatarFallback className={thread.isGroup ? "bg-primary/5 text-primary" : ""}>
                    {thread.isGroup ? <Users className="h-5 w-5" /> : thread.display.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 overflow-hidden">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="font-semibold text-sm truncate">{thread.display.name}</span>
                          {thread.type && (
                              <span className={cn(
                                  "px-1.5 py-0.5 rounded-full text-[9px] font-medium border",
                                  thread.type === "Group" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-orange-50 text-orange-700 border-orange-200"
                              )}>
                                  {thread.type}
                              </span>
                          )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: false })}
                      </span>
                   </div>
                   <p className="text-xs text-muted-foreground truncate mt-0.5 pr-2">
                     {/* Clean up the markdown for preview if it's a ticket */}
                     {thread.lastMessage.startsWith("**Issue Type:**") 
                        ? thread.lastMessage.split("**Summary:**")[1]?.split("**Description:**")[0]?.trim() || "Support Ticket"
                        : thread.lastMessage}
                   </p>
                </div>
                {thread.unreadCount > 0 && selectedThreadId !== thread.threadId && (
                   <div className="h-5 min-w-5 px-1.5 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                      {thread.unreadCount}
                   </div>
                )}
              </button>
            ))
         )}
      </div>
    </div>
  );
}
