"use client";

import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { BookIcon, CheckCircle, X } from "lucide-react";
import { markLessonComplete, updateVideoProgress } from "../actions";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getSignedVideoUrl } from "@/app/data/course/get-signed-video-url";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { IconFileText } from "@tabler/icons-react";
import { env } from "@/lib/env";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";
import { VideoPlayer as CustomPlayer } from "@/components/video-player/VideoPlayer";

import { LessonContentSkeleton } from "./lessonSkeleton";

interface iAppProps {
  lessonId: string;
  userId: string;
  initialLesson?: any;
  initialVersion?: string | null;
}

function VideoPlayer({
  thumbnailkey,
  videoKey,
  lessonId,
  initialTime = 0,
  spriteKey,
  spriteCols,
  spriteRows,
  spriteInterval,
  spriteWidth,
  spriteHeight,
}: {
  thumbnailkey: string;
  videoKey: string;
  lessonId: string;
  initialTime?: number;
  spriteKey?: string | null;
  spriteCols?: number | null;
  spriteRows?: number | null;
  spriteInterval?: number | null;
  spriteWidth?: number | null;
  spriteHeight?: number | null;
}) {
  const thumbnailUrl = useConstructUrl(thumbnailkey);
  const spriteUrl = useConstructUrl(spriteKey || "");

  const spriteMetadata = useMemo(() => {
    // 1. If we have an explicit spriteKey, use it (VTT or Legacy)
    if (spriteKey) {
       // Legacy check: if it's meant to be a grid but missing dims, we might fail, 
       // but for VTT we just need the key.
       return {
          url: spriteUrl,
          cols: spriteCols ?? 0,
          rows: spriteRows ?? 0,
          interval: spriteInterval ?? 0,
          width: spriteWidth ?? 0,
          height: spriteHeight ?? 0,
       };
    }

    // 2. Fallback: If no spriteKey but we have a videoKey, infer standard VTT path
    if (videoKey) {
        const baseKey = videoKey.replace(/\.[^/.]+$/, "");
        const inferredKey = `sprites/${baseKey}/thumbnails.vtt`;
        // We can't use useConstructUrl inside useMemo meaningfully if we didn't call it top level,
        // but here we know the bucket pattern. 
        // Better: let's use the hook for the inferred key if possible, or just construct it manually via env.
        const inferredUrl = `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${inferredKey}`;
        return {
           url: inferredUrl,
           cols: 0, rows: 0, interval: 0, width: 0, height: 0
        };
    }

    return undefined;
  }, [spriteUrl, spriteKey, videoKey, spriteCols, spriteRows, spriteInterval, spriteWidth, spriteHeight]);
  // const videoRef = useRef<HTMLVideoElement>(null); // Removed as CustomPlayer handles the tech
  // Track video coverage delta
  const lastPositionRef = useRef<number>(initialTime);
  const unsyncedDeltaRef = useRef<number>(0);
  const hasSyncedOnMountRef = useRef<boolean>(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);

  const sources = useMemo(() => {
    const list = [];
    if (videoUrl) list.push({ src: videoUrl, type: "video/mp4" });
    if (hlsUrl) list.push({ src: hlsUrl, type: "application/x-mpegURL" });
    return list;
  }, [hlsUrl, videoUrl]);

  // const thumbnailUrl = useConstructUrl(thumbnailkey); // Removed duplicate

  /* ============================================================
     STORAGE HELPERS (Cookie + LocalStorage)
  ============================================================ */
  const setCookie = (name: string, value: string, days = 7) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  };

  const getCookie = (name: string): string => {
    return document.cookie.split("; ").reduce((r, v) => {
      const parts = v.split("=");
      return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, "");
  };

  const deleteCookie = (name: string) => {
    document.cookie = `${name}=; expires=Sun, 01 Jan 2023 00:00:00 UTC; path=/; SameSite=Lax`;
  };

  const saveUnsyncedDelta = () => {
    const val = unsyncedDeltaRef.current;
    if (val === 0) return;
    
    const data = val.toString();
    localStorage.setItem(`unsynced-delta-${lessonId}`, data);
    setCookie(`unsynced-delta-${lessonId}`, data);
  };

  const loadUnsyncedDelta = (): number => {
    // Check localStorage first, then cookie
    const localData = localStorage.getItem(`unsynced-delta-${lessonId}`);
    if (localData) return parseFloat(localData);
    
    const cookieData = getCookie(`unsynced-delta-${lessonId}`);
    if (cookieData) return parseFloat(cookieData);
    
    return 0;
  };

  const clearLocalDelta = () => {
    unsyncedDeltaRef.current = 0;
    localStorage.removeItem(`unsynced-delta-${lessonId}`);
    deleteCookie(`unsynced-delta-${lessonId}`);
  };

  /* ============================================================
     SYNC TO DATABASE
  ============================================================ */
  const syncToDB = async (specificLessonId?: string, delta?: number, position?: number) => {
    const targetId = specificLessonId || lessonId;
    const currentPosition = position !== undefined ? position : lastPositionRef.current;
    const deltaToSync = Math.round(delta !== undefined ? delta : unsyncedDeltaRef.current);

    if (deltaToSync === 0 && position === undefined) return;

    console.log(`[Sync] Syncing ${targetId}: Position ${currentPosition}, Delta ${deltaToSync}`);
    
    // ✅ Send consumed video duration to DB
    const response = await updateVideoProgress(targetId, currentPosition, deltaToSync);

    if (response.status === "success" && !specificLessonId) {
      // ✅ Clear local state only after successful sync for current lesson
      clearLocalDelta();
    } else if (response.status === "success" && specificLessonId) {
        // Clear specific lesson delta
        localStorage.removeItem(`unsynced-delta-${specificLessonId}`);
        const expires = new Date(0).toUTCString();
        document.cookie = `unsynced-delta-${specificLessonId}=; expires=${expires}; path=/; SameSite=Lax`;
    }
  };

  /* ============================================================
     ON MOUNT: Load from localStorage/cookie and sync to DB
  ============================================================ */
  useEffect(() => {
    if (hasSyncedOnMountRef.current) return;
    hasSyncedOnMountRef.current = true;

    const performGlobalSync = async () => {
      // 1. Sync current lesson leftover
      const previousDelta = loadUnsyncedDelta();
      const savedTime = localStorage.getItem(`video-progress-${lessonId}`);
      const positionToSync = savedTime ? parseFloat(savedTime) : initialTime;
      
      if (previousDelta > 0 || (savedTime && parseFloat(savedTime) > initialTime)) {
        await syncToDB(lessonId, previousDelta, positionToSync);
      }

      // 2. Global Sync: Find other unsynced deltas in localStorage
      try {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith("unsynced-delta-") && !key.includes(lessonId)) {
            const otherLessonId = key.replace("unsynced-delta-", "");
            const otherDelta = parseFloat(localStorage.getItem(key) || "0");
            const otherPosition = parseFloat(localStorage.getItem(`video-progress-${otherLessonId}`) || "0");
            
            if (otherDelta > 0) {
              console.log(`[Global Sync] Found leftover for ${otherLessonId}`);
              await syncToDB(otherLessonId, otherDelta, otherPosition);
            }
          }
        }
      } catch (e) {
        console.error("[Global Sync] Error:", e);
      }
    };

    performGlobalSync();
  }, [lessonId, initialTime]);

  /* ============================================================
     TRACK WATCHED SECONDS (Every second during playback)
  ============================================================ */
  const trackCoverage = (currentPos: number) => {
    // 🔴 Multi-tab safety: Only track if the page is active
    if (document.visibilityState !== "visible") return;

    const delta = currentPos - lastPositionRef.current;

    // Only track positive progress and ignore large jumps (seeks)
    if (delta > 0 && delta < 2) {
      unsyncedDeltaRef.current += delta;
      
      // Heartbeat save to storage (LocalStorage)
      if (Math.round(unsyncedDeltaRef.current) % 5 === 0) {
        saveUnsyncedDelta();
      }
    }
    
    lastPositionRef.current = currentPos;
  };

  /* ============================================================
     PERSISTENCE HEARTBEAT (Every 5 seconds for Cookie)
  ============================================================ */
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        saveUnsyncedDelta(); // Update cookie backup
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [lessonId]);

  /* ============================================================
     HLS URL SETUP
  ============================================================ */
  useEffect(() => {
    if (!videoKey) return;

    const fetchUrls = async () => {
      // 1. Setup HLS URL (Static construction)
      const hlsKey = `hls/${videoKey.replace(/\.[^/.]+$/, "")}/master.m3u8`;
      const hlsFullUrl = `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${hlsKey}`;
      setHlsUrl(hlsFullUrl);

      // 2. Setup Signed MP4 URL (Fallback)
      const response = await getSignedVideoUrl(videoKey) as any;
      if (response && response.status === "success" && response.url) {
        setVideoUrl(response.url);
      }
    };

    fetchUrls();
  }, [videoKey]);


  /* ============================================================
     ON UNMOUNT: Sync to DB
  ============================================================ */
  useEffect(() => {
    return () => {
      // Final tracking call to capture the very last seconds
      syncToDB();
    };
  }, [lessonId]);

  /* ============================================================
     BEFOREUNLOAD: Save to both storages
  ============================================================ */
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveUnsyncedDelta();
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
            saveUnsyncedDelta();
            syncToDB();
        }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [lessonId]);

  /* ============================================================
     VIDEO POSITION TRACKING (localStorage for resume)
  ============================================================ */
  const saveProgress = (time: number) => {
    localStorage.setItem(`video-progress-${lessonId}`, time.toString());
  };

  const onLoadedMetadata = (duration: number) => {
    // No-op for now as CustomPlayer handles seeking initially
  };

  const onTimeUpdate = (currentTime: number) => {
    // ✅ Track coverage
    trackCoverage(currentTime);

    // Save position for resume (every 5 seconds)
    const lastSavedTime = parseFloat(
      localStorage.getItem(`video-progress-${lessonId}`) || "0"
    );

    if (Math.abs(currentTime - lastSavedTime) > 5) {
      saveProgress(currentTime);
    }
  };

  /* ============================================================
     VIDEO EVENT HANDLERS
  ============================================================ */
  const onPlay = () => {
    // Handled via onTimeUpdate implicitly
  };

  const onPause = () => {
    saveUnsyncedDelta();
    // ❌ Removed syncToDB() here to reduce server calls
  };

  const onEnded = () => {
    saveUnsyncedDelta();
    syncToDB(); // Keep sync on end just in case, or remove if user strictly wants refresh/exit only
  };


  /* ============================================================
     UI STATES
  ============================================================ */
  if (!videoKey) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center border">
        <BookIcon className="size-16 text-primary mb-4" />
        <p className="text-muted-foreground">This lesson does not have a video yet</p>
      </div>
    );
  }

  if (!videoUrl && !hlsUrl) {
    return <div className="aspect-video bg-muted rounded-lg border animate-pulse" />;
  }

  /* ============================================================
     PLAYER RENDER
  ============================================================ */
  return (
    <div className="relative aspect-video rounded-lg border overflow-hidden">
      {sources.length > 0 && (
        <CustomPlayer
          key={lessonId}
          sources={sources}
          poster={thumbnailUrl}
          initialTime={initialTime}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onLoadedMetadata={onLoadedMetadata}
          spriteMetadata={spriteMetadata}
          className="w-full h-full"
        />
      )}
    </div>
  );
}

export function CourseContent({ lessonId, userId, initialLesson, initialVersion }: iAppProps) {
  // Sync initialData to local storage on mount to keep local cache fresh
  useEffect(() => {
    if (initialLesson && initialVersion) {
        const cacheKey = `lesson_content_${lessonId}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        
        // Sync if version differs or doesn't exist
        if (!cached || cached.version !== initialVersion) {
            console.log(`[Hydration] Syncing server data to local cache for ${lessonId}`);
            chatCache.set(cacheKey, { lesson: initialLesson }, userId, initialVersion, 10800000);
        }
    }
  }, [lessonId, userId, initialLesson, initialVersion]);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson_content", lessonId],
    queryFn: async () => {
      const cacheKey = `lesson_content_${lessonId}`;
      const cached = chatCache.get<any>(cacheKey, userId);
      const clientVersion = cached?.version;

      console.log(`[Lesson] Syncing for ${lessonId}...`);
      const result = await getLessonContent(lessonId, clientVersion);

      if (result && (result as any).status === "not-modified" && cached) {
        return cached.data.lesson;
      }

      if (result && !(result as any).status) {
        chatCache.set(cacheKey, result, userId, (result as any).version, 10800000);
        return (result as any).lesson;
      }
      return (result as any)?.lesson;
    },
    initialData: () => {
        // ⭐ PRIORITY 1: Server-provided data (Source of Truth for fresh refresh)
        if (initialLesson) return initialLesson;

        // ⭐ PRIORITY 2: Local Cache (For fast navigation/stale state)
        const cacheKey = `lesson_content_${lessonId}`;
        const cached = chatCache.get<any>(cacheKey, userId);
        if (typeof window !== "undefined" && cached) {
            return cached.data.lesson;
        }
        return undefined;
    },
    staleTime: 1800000, // 30 mins
  });

  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const { triggerConfetti } = useConfetti2();
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(false);

  useEffect(() => {
    setIsDescriptionOpen(false);
  }, [lessonId]);

  if (isLoading && !lesson) {
    return <LessonContentSkeleton />;
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Lesson not found</h2>
        <p className="text-muted-foreground">The lesson you are looking for might have been moved or deleted.</p>
      </div>
    );
  }

  const data = lesson;

  function onSubmit() {
    setOptimisticCompleted(true);
    triggerConfetti();

    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        markLessonComplete(data.id, data.Chapter.Course.slug)
      );

      if (error) {
        setOptimisticCompleted(false);
        toast.error("An unexpected error occurred. Please try again later.");
        return;
      }

      if (result.status === "success") {
        // ✅ Invalidate Client Caches
        const slug = data.Chapter.Course.slug;
        const cacheKeys = [
            `lesson_content_${lessonId}`,
            `course_sidebar_${slug}`,
            `user_dashboard_${userId}`
        ];

        // 1. Clear LocalStorage
        cacheKeys.forEach(key => chatCache.invalidate(key, userId));

        // 2. Invalidate React Query
        queryClient.invalidateQueries({ queryKey: ["lesson_content", lessonId] });
        queryClient.invalidateQueries({ queryKey: ["course_sidebar", slug] });
        queryClient.invalidateQueries({ queryKey: ["user_dashboard", userId] });
        
        toast.success(result.message);
      } else {
        setOptimisticCompleted(false);
        toast.error(result.message);
      }
    });
  }

  const isCompleted = optimisticCompleted || data.lessonProgress?.some((p: any) => p.completed);
  const hasVideo = Boolean(data.videoKey);

  return (
    <div className="relative flex flex-col md:flex-row bg-background h-full overflow-hidden">
      <div className="flex-1 flex flex-col py-2 md:pl-6 overflow-y-auto">
        <div className="order-2 md:order-1 w-full">
          <VideoPlayer
            thumbnailkey={data.thumbnailKey ?? ""}
            videoKey={data.videoKey ?? ""}
            lessonId={data.id}
            initialTime={data.lessonProgress?.[0]?.lastWatched ?? 0}
            spriteKey={data.spriteKey}
            spriteCols={data.spriteCols}
            spriteRows={data.spriteRows}
            spriteInterval={data.spriteInterval}
            spriteWidth={data.spriteWidth}
            spriteHeight={data.spriteHeight}
          />
        </div>

        <div className="hidden md:block order-3 md:order-2 pt-6 md:pt-3 md:pb-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
            {data.title}
          </h1>
        </div>

        <div className="order-2 md:order-3 flex items-center justify-between gap-4 pt-6 md:pt-6 md:pb-0 md:border-t mb-0">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <Button disabled className="gap-2">
                <CheckCircle className="size-4" />
                Completed
              </Button>
            ) : (
              <Button disabled={isPending || !hasVideo} onClick={onSubmit} className="gap-2">
                {hasVideo ? (
                  <>
                    <CheckCircle className="size-4" />
                    Mark as Completed
                  </>
                ) : (
                  "No Video Available"
                )}
              </Button>
            )}
          </div>

          {data.description && (
            <div className="flex items-center gap-2">
              <Button
                variant={isDescriptionOpen ? "secondary" : "outline"}
                className="gap-2 shrink-0 hidden md:flex"
                onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
              >
                <IconFileText className="size-4" />
                {isDescriptionOpen ? "Hide Description" : "View Description"}
              </Button>

              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline" className="gap-2 shrink-0 md:hidden">
                    <IconFileText className="size-4" />
                    View Description
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[85vh]">
                  <div className="max-w-4xl mx-auto w-full overflow-y-auto px-4 pb-8">
                    <DrawerHeader className="px-0">
                      <DrawerTitle className="text-2xl font-bold flex items-center gap-2">
                        <IconFileText className="size-6 text-primary" />
                        {data.title}
                      </DrawerTitle>
                    </DrawerHeader>
                    <div className="mt-4">
                      <RenderDescription json={JSON.parse(data.description)} />
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          )}
        </div>
      </div>

      {data.description && isDescriptionOpen && (
        <div className="absolute bottom-0 left-6 right-0 h-[85vh] z-30 hidden md:flex flex-col border border-border shadow-xl bg-background/95 animate-in slide-in-from-bottom duration-500 overflow-hidden rounded-t-3xl">
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <IconFileText className="size-5 text-primary" />
              {data.title}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setIsDescriptionOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain"
            data-lenis-prevent
          >
            <RenderDescription json={JSON.parse(data.description!)} />
          </div>
        </div>
      )}
    </div>
  );
}
