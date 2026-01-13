"use client";

import { useState, useEffect, useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search, Users, Archive, ChevronLeft } from "lucide-react";
import { formatDistanceToNow, isToday, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";


import { ChatSidebarSkeleton } from "./ChatSkeleton";

interface ChatSidebarProps {
  selectedThreadId: string | null;
  onSelectThread: (thread: { id: string; name: string; image?: string; type?: string }) => void;
  isAdmin: boolean;
  removedIds?: string[];
  threads: any[];
  loading?: boolean;
}

export function ChatSidebar({ selectedThreadId, onSelectThread, isAdmin, removedIds = [], threads = [], loading = false }: ChatSidebarProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Groups" | "Tickets" | "Resolved">("All");
  const [view, setView] = useState<"recent" | "archived">("recent");
  const viewRef = useRef(view);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const searchParams = useSearchParams();
  const urlThreadId = searchParams.get("threadId");

  const getAvatarUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("/")) return url;
    return useConstructUrl(url);
  };

  const queryClient = useQueryClient();

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["sidebarData"] });
  };

  useEffect(() => {
    const handleThreadUpdate = (e: any) => {
      const { threadId, archived, muted, lastMessage, updatedAt, hidden } = e.detail;

      // AUTO-SWITCH VIEW IF CURRENT THREAD IS UNARCHIVED
      if (threadId === selectedThreadId && archived === false && viewRef.current === "archived") {
        setView("recent");
      }

      queryClient.setQueryData(["sidebarData"], (old: any) => {
        if (!old || !old.threads) return old;

        let updatedThreads = [...old.threads];
        const index = updatedThreads.findIndex(t => t.threadId === threadId);

        if (index !== -1) {
          // UPDATE EXISTING THREAD
          updatedThreads[index] = {
            ...updatedThreads[index],
            ...(archived !== undefined && { archived }),
            ...(muted !== undefined && { muted }),
            ...(hidden !== undefined && { hidden }),
            ...(lastMessage !== undefined && { lastMessage }),
            ...(updatedAt !== undefined && { updatedAt }),
          };
        } else if (!hidden) {
          // If thread doesn't exist and isn't being hidden, we should probably refetch 
          // to get the full thread details, but for now we'll just wait for the next sync.
          // Or we could trigger a slow refetch in the background.
          setTimeout(() => refetch(), 100);
          return old;
        }

        return { ...old, threads: updatedThreads.filter(t => !t.hidden) };
      });
    };
    const handleRefresh = () => {
      // refetch();
    };
    window.addEventListener("chat-refresh", handleRefresh);
    window.addEventListener("chat-thread-update", handleThreadUpdate);
    return () => {
      window.removeEventListener("chat-refresh", handleRefresh);
      window.removeEventListener("chat-thread-update", handleThreadUpdate);
    };
  }, [refetch]);

  // Auto-select thread from URL (only on initial load or explicit URL change)
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    // Only auto-select from URL if:
    // 1. URL has a threadId
    // 2. Threads are loaded
    // 3. We haven't already selected this thread
    // 4. This is either the first load OR the URL actually changed
    if (urlThreadId && threads.length > 0 && selectedThreadId !== urlThreadId) {
      const thread = (threads as any[]).find(t => t.threadId === urlThreadId);
      if (thread) {
        // Only trigger auto-select if we haven't done it yet, or if URL genuinely changed
        if (!hasAutoSelectedRef.current || selectedThreadId === null) {
          onSelectThread({
            id: thread.threadId,
            name: thread.display.name,
            image: thread.display.image,
            type: thread.type
          });
          hasAutoSelectedRef.current = true;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlThreadId, threads]);

  const filteredThreads = (threads as any[]).filter(t => {
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

  const recentThreads = filteredThreads.filter(t => !t.archived);
  const archivedThreads = filteredThreads.filter(t => t.archived);

  const archivedUnreadCount = archivedThreads.reduce((acc: number, t: any) => acc + (t.unreadCount || 0), 0);

  const displayThreads = view === "recent" ? recentThreads : archivedThreads;

  const renderThread = (thread: any) => (
    <div
      key={thread.threadId}
      onClick={() => onSelectThread({
        id: thread.threadId,
        name: thread.display.name,
        image: thread.display.image,
        type: thread.type
      })}
      className={cn(
        "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left cursor-pointer",
        selectedThreadId === thread.threadId
          ? "bg-primary/10 shadow-sm"
          : (thread.unreadCount > 0 ? "bg-blue-50/60 ring-1 ring-blue-100/50 shadow-sm" : "hover:bg-muted")
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelectThread({
            id: thread.threadId,
            name: thread.display.name,
            image: thread.display.image,
            type: thread.type
          });
        }
      }}
    >
      <Avatar className="h-10 w-10 border bg-background shrink-0">
        <AvatarImage
          src={getAvatarUrl(thread.display.image)}
          className="object-cover"
          width={200}
          height={200}
        />
        <AvatarFallback className={thread.isGroup ? "bg-primary/5 text-primary" : ""}>
          {thread.isGroup ? <Users className="h-5 w-5" /> : thread.display.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className={cn(
              "font-semibold text-sm truncate",
              thread.unreadCount > 0 ? "text-blue-700 font-bold" : "text-foreground"
            )}>{thread.display.name}</span>
            {thread.type && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[9px] font-medium border shrink-0",
                thread.type === "Group" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  thread.type === "Support" ? "bg-orange-50 text-orange-700 border-orange-200" :
                    "bg-purple-50 text-purple-700 border-purple-200"
              )}>
                {thread.type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {thread.unreadCount > 0 && (
              <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" />
            )}
            <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
              {isToday(new Date(thread.updatedAt))
                ? format(new Date(thread.updatedAt), "h:mm a")
                : formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: false })}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            "text-xs truncate mt-0.5 flex-1",
            thread.unreadCount > 0 ? "text-blue-600/90 font-semibold" : "text-muted-foreground"
          )}>
            {thread.lastMessage.startsWith("**Issue Type:**")
              ? thread.lastMessage.split("**Summary:**")[1]?.split("**Description:**")[0]?.trim() || "Support Ticket"
              : thread.lastMessage}
          </p>
        </div>
      </div>
      {thread.unreadCount > 0 && selectedThreadId !== thread.threadId && (
        <div className="h-5 min-w-5 px-1.5 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
          {thread.unreadCount}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-background overflow-hidden">
      <div className="p-4 border-b space-y-4 shrink-0">
        <div className="flex items-center justify-between px-2">
          <h2 className="font-bold text-lg">Resources</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search groups..."
            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div
        data-lenis-prevent
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar p-2 space-y-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40 text-left"
      >
        {loading ? (
          <ChatSidebarSkeleton />
        ) : (
          <>
            {view === "recent" && archivedThreads.length > 0 && (
              <button
                onClick={() => setView("archived")}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left hover:bg-muted mb-2 group"
              >
                <div className="h-10 w-10 rounded-full bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors">
                  <Archive className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-sm">Archived</span>
                </div>
                {archivedUnreadCount > 0 && (
                  <div className="h-5 min-w-5 px-1.5 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {archivedUnreadCount}
                  </div>
                )}
              </button>
            )}

            {view === "archived" && (
              <button
                onClick={() => setView("recent")}
                className="w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left hover:bg-muted mb-4 text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm font-semibold">Back to Chats</span>
              </button>
            )}

            {displayThreads.length === 0 ? (
              view === "archived" ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                  <Archive className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-sm">No archived chats</p>
                  <button onClick={() => setView("recent")} className="text-xs text-primary mt-4 font-medium hover:underline">Go Back</button>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground text-sm">No messages yet</div>
              )
            ) : (
              displayThreads.map(renderThread)
            )}
          </>
        )}
      </div>
    </div>
  );
}
