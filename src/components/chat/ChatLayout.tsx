"use client";

import { useState, useEffect } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportTicketDialog } from "@/app/(users)/_components/SupportTicketDialog";
import { getThreadsAction } from "@/app/data/notifications/actions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  chatCache,
  getSidebarKey,
  getSidebarLocalKey,
  PERMANENT_TTL,
} from "@/lib/chat-cache";

import { useSmartSession } from "@/hooks/use-smart-session";

interface ChatLayoutProps {
  isAdmin?: boolean;
  currentUserId?: string;
}

interface SidebarCachedData {
  threads: ThreadItem[];
  enrolledCourses?: Array<{ id: string; title: string }>;
  version?: string;
  presence?: string | null;
}

interface ThreadItem {
  threadId: string;
  display: { name: string; image: string };
  type: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
  isGroup: boolean;
  archived: boolean;
  muted: boolean;
  resolved: boolean;
  hidden: boolean;
}

export function ChatLayout({
  isAdmin: propIsAdmin,
  currentUserId: propCurrentUserId,
}: ChatLayoutProps) {
  const { user, isLoading: isAuthLoading } = useSmartSession();
  const queryClient = useQueryClient();

  // Derive from session if not provided via props
  const isAdmin =
    propIsAdmin ??
    (user?.role === "admin" ||
      (typeof window !== "undefined" &&
        window.location.pathname.startsWith("/admin")));
  const currentUserId = propCurrentUserId ?? user?.id;

  const [selectedThread, setSelectedThread] = useState<{
    id: string;
    name: string;
    image?: string;
    type?: string;
  } | null>(null);
  const [removedThreadIds, setRemovedThreadIds] = useState<string[]>([]);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const lastVersionRef = useRef<number | null>(null);
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!hasLogged.current) {
      // Admin cache is generic (admin_chat_sidebar), so we don't need currentUserId to check it
      const localKey = getSidebarLocalKey(isAdmin);
      const needsUserId = !isAdmin;

      // For users, wait for currentUserId. For admins, proceed.
      if (!needsUserId || (currentUserId && !isAuthLoading)) {
        const cached = chatCache.get<SidebarCachedData>(
          localKey,
          isAdmin ? undefined : currentUserId,
        );
        if (cached) {
          console.log(
            `%c[ChatLayout] LOCAL HIT (v${cached.version}). Rendering from device storage.`,
            "color: #eab308; font-weight: bold",
          );
        }
        hasLogged.current = true;
      }
    }

    if (!currentUserId || isAuthLoading) return;

    // Cross-Tab Sync: Listen for storage changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      const localKey = getSidebarLocalKey(isAdmin);
      if (e.key?.includes(localKey)) {
        console.log(`[Chat] Cross-Tab Sync: Storage updated. Refetching...`);
        queryClient.invalidateQueries({
          queryKey: getSidebarKey(currentUserId, isAdmin),
        });
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [currentUserId, isAdmin, isAuthLoading, queryClient]);

  // Centralized Data Fetch (Threads + Courses + Version)
  const { data: sidebarData, isLoading } = useQuery({
    queryKey: getSidebarKey(currentUserId, isAdmin),

    queryFn: async () => {
      const localKey = getSidebarLocalKey(isAdmin);

      const cached = chatCache.get<SidebarCachedData>(
        localKey,
        isAdmin ? undefined : currentUserId,
      );

      const clientVersion = cached?.version;

      console.log(
        `[Chat] Smart Sync: checking version ${clientVersion || "NULL"}...`,
      );

      const result = await getThreadsAction();

      if (result && "status" in result && result.status === "not-modified" && cached) {
        console.log(
          `%c[Chat] SERVER HIT: NOT_MODIFIED (v${clientVersion}). Key: ${localKey}`,
          "color: #eab308; font-weight: bold",
        );
        return cached.data;
      }

      if (result && !("status" in result)) {
        console.log(
          `%c[Chat] SERVER HIT: NEW_DATA. Syncing (v${result.version}). Key: ${localKey}`,
          "color: #eab308; font-weight: bold",
        );

        const sidebarResult = result as unknown as SidebarCachedData & { version: string };
        const oldCoursesCount =
          (cached?.data as SidebarCachedData | undefined)?.enrolledCourses?.length || 0;
        const newCoursesCount = sidebarResult.enrolledCourses?.length || 0;
        const enrollmentChanged = oldCoursesCount !== newCoursesCount;

        chatCache.set(
          localKey,
          result,
          isAdmin ? undefined : currentUserId,
          result.version,
          PERMANENT_TTL,
        );

        // 🔹 Surgical Sync: Only clear Dashboard if enrollment actually changed
        // or if another component explicitly requested a sync (needsSync)
        if (
          currentUserId &&
          (enrollmentChanged || chatCache.needsSync(currentUserId))
        ) {
          console.log(
            "[Chat] Enrollment change or sync requested. Invalidating dashboard data...",
          );
          chatCache.invalidateUserDashboardData(currentUserId);
          chatCache.clearSync(currentUserId);
        }
        return result;
      }

      return cached?.data || null;
    },

    initialData: () => {
      if (typeof window === "undefined") return undefined;

      const localKey = getSidebarLocalKey(isAdmin);

      const cached = chatCache.get<SidebarCachedData>(
        localKey,
        isAdmin ? undefined : currentUserId,
      );

      if (cached?.data) {
        return cached.data as SidebarCachedData;
      }

      return undefined;
    },

    initialDataUpdatedAt:
      typeof window !== "undefined"
        ? (() => {
            const entry = chatCache.get<SidebarCachedData>(
              getSidebarLocalKey(isAdmin),
              isAdmin ? undefined : currentUserId,
            );
            return entry?.timestamp as number | undefined;
          })()
        : undefined,
    // 30-minute version check (Heartbeat)
    staleTime: 1800000,
    refetchInterval: 1800000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!(isAdmin || currentUserId), // Enable for admins immediately, or users with ID
  });

  const sData = sidebarData as SidebarCachedData | undefined;
  const threads = sData?.threads ?? [];
  const version = sData?.version;

  // Group initialization is now handled more efficiently inside getThreadsAction

  // Version tracking (for potential real-time sync later)
  useEffect(() => {
    if (version !== undefined && version !== null) {
      lastVersionRef.current = typeof version === "string" ? parseInt(version) : version;
    }
  }, [version]);

  const handleRemoveThread = (threadId: string) => {
    setRemovedThreadIds((prev) => [...prev, threadId]);
    setSelectedThread(null);
  };

  const handleSelectThread = (
    thread: { id: string; name: string; image?: string; type?: string } | null,
  ) => {
    setSelectedThread(thread);

    const url = new URL(window.location.href);
    if (thread) {
      url.searchParams.set("threadId", thread.id);
    } else {
      url.searchParams.delete("threadId");
    }
    window.history.replaceState(null, "", url.toString());
  };

  // Custom hook or simple check for mobile
  // For simplicity, using CSS display logic mostly, but state helps for "view" mode
// We can use a real hook, or better, just render conditionally with CSS

  return (
    <div className="flex h-full w-full overflow-hidden bg-background border rounded-xl shadow-sm">
      {/* SIDEBAR - Hidden on mobile if thread selected */}
      <div
        className={`w-full lg:w-[350px] border-r flex flex-col h-full min-h-0 overflow-hidden ${selectedThread ? "hidden lg:flex" : "flex"}`}
      >
        {/* Sidebar Header with New Ticket Action for Users */}
        {!isAdmin && (
          <div className="p-3.5 border-b bg-muted/20 shrink-0">
            <Button
              className="w-full gap-2"
              onClick={() => setIsNewTicketOpen(true)}
            >
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
          currentUserId={currentUserId ?? ""}
          isAdmin={isAdmin}
        />
      </div>

      {/* CHAT WINDOW - Hidden on mobile if NO thread selected */}
      <div
        className={`flex-1 flex flex-col h-full min-h-0 overflow-hidden ${!selectedThread ? "hidden lg:flex" : "flex"}`}
      >
        {selectedThread ? (
          <div className="flex flex-col h-full min-h-0 overflow-hidden relative">
            <ChatWindow
              key={selectedThread.id}
              threadId={selectedThread.id}
              title={selectedThread.name}
              avatarUrl={selectedThread.image ?? ""}
              isGroup={selectedThread.type === "Group"}
              isAdmin={isAdmin}
              currentUserId={currentUserId ?? ""}
              onRemoveThread={handleRemoveThread}
              onBack={() => handleSelectThread(null)}
              externalPresence={(sidebarData as SidebarCachedData | undefined)?.presence ?? null}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/10 p-8 text-center">
            <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <MessageSquarePlus className="h-10 w-10 opacity-50" />
            </div>
            <h3 className="text-xl font-bold text-foreground">
              Select a Conversation
            </h3>
            <p className="max-w-xs mt-2">
              Choose a chat from the sidebar to start messaging{" "}
              {isAdmin ? "with a user" : "with support"}.
            </p>
          </div>
        )}
      </div>

      <SupportTicketDialog
        open={isNewTicketOpen}
        onOpenChange={setIsNewTicketOpen}
        courses={(sidebarData as SidebarCachedData | undefined)?.enrolledCourses ?? []}
        userId={currentUserId}
      />
    </div>
  );
}
