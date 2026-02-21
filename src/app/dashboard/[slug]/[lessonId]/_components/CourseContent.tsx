"use client";

import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { BookIcon, CheckCircle, ChevronRight, X } from "lucide-react";
import { markLessonComplete, updateVideoProgress } from "../actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getSignedVideoUrl } from "@/app/data/course/get-signed-video-url";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { IconFileText } from "@tabler/icons-react";
import { env } from "@/lib/env";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { secureStorage } from "@/lib/secure-storage";
import { VideoPlayer as CustomPlayer } from "@/components/video-player/VideoPlayer";
import CryptoJS from "crypto-js";
import { getLessonMCQs } from "@/app/admin/lessons/mcqs/actions";
import { AssessmentModal } from "./AssessmentModal";

import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/ui/Loader";
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
  userId,
  initialTime = 0,
  spriteKey,
  spriteCols,
  spriteRows,
  spriteInterval,
  spriteWidth,
  spriteHeight,
  lowResKey,
  transcriptionUrl,
}: {
  thumbnailkey: string;
  videoKey: string;
  lessonId: string;
  userId: string;
  initialTime?: number;
  spriteKey?: string | null;
  spriteCols?: number | null;
  spriteRows?: number | null;
  spriteInterval?: number | null;
  spriteWidth?: number | null;
  spriteHeight?: number | null;
  lowResKey?: string | null;
  transcriptionUrl?: string | null;
}) {
  const thumbnailUrl = useConstructUrl(thumbnailkey);
  const spriteUrl = useConstructUrl(spriteKey || "");
  const lowResUrl = useConstructUrl(lowResKey || "");
  const [vttCues, setVttCues] = useState<any[]>([]);

  const spriteMetadata = useMemo(() => {
    // 1. If we have an explicit spriteKey, use it (VTT or Legacy)
    if (spriteKey) {
       return {
          url: spriteUrl,
          lowResUrl: lowResUrl,
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
        // Sprites stay in the PUBLIC bucket for performance/simplicity
        const inferredUrl = `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${inferredKey}`;
        const inferredLowKey = `sprites/${baseKey}/preview_low.jpg`;
        const inferredLowUrl = `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${inferredLowKey}`;
        
        return {
           url: inferredUrl,
           lowResUrl: inferredLowUrl,
           cols: 0, rows: 0, interval: 0, width: 0, height: 0
        };
    }

    return undefined;
  }, [spriteUrl, spriteKey, videoKey, spriteCols, spriteRows, spriteInterval, spriteWidth, spriteHeight]);

  // ✅ Prefetch VTT metadata
  useEffect(() => {
    if (!spriteMetadata?.url || !spriteMetadata.url.includes(".vtt")) return;
    
    const fetchVtt = async () => {
        try {
            const res = await fetch(spriteMetadata.url);
            if (!res.ok) return;
            const text = await res.text();
            
            // Simple VTT parser to pre-parse for the player
            const lines = text.split("\n");
            const parsedCues: any[] = [];
            let currentCue: any = {};
            
            lines.forEach(line => {
              line = line.trim();
              if (line === "WEBVTT" || line === "") return;
              
              if (line.includes("-->")) {
                const [start, end] = line.split("-->").map(t => {
                  const parts = t.trim().split(":");
                  let s = 0;
                  if (parts.length === 3) {
                    s += parseFloat(parts[0]) * 3600;
                    s += parseFloat(parts[1]) * 60;
                    s += parseFloat(parts[2]);
                  } else {
                    s += parseFloat(parts[0]) * 60;
                    s += parseFloat(parts[1]);
                  }
                  return s;
                });
                currentCue.startTime = start;
                currentCue.endTime = end;
              } else if (line.includes("#xywh=")) {
                const [url, hash] = line.split("#xywh=");
                const [x, y, w, h] = hash.split(",").map(Number);
                currentCue.url = url;
                currentCue.x = x;
                currentCue.y = y;
                currentCue.w = w;
                currentCue.h = h;
                parsedCues.push(currentCue);
                currentCue = {};
              }
            });
            setVttCues(parsedCues);
        } catch (e) {
            console.error("[VTT Prefetch] Failed:", e);
        }
    };
    fetchVtt();
  }, [spriteMetadata?.url]);
  // const videoRef = useRef<HTMLVideoElement>(null); // Removed as CustomPlayer handles the tech
  // Track video coverage delta
  const lastPositionRef = useRef<number>(initialTime);
  const sessionDeltaRef = useRef<number>(0);
  const hasSyncedOnMountRef = useRef<boolean>(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [captionUrl, setCaptionUrl] = useState<string | undefined>(undefined);

  const sources = useMemo(() => {
    const list = [];
    if (hlsUrl) list.push({ src: hlsUrl, type: "application/x-mpegURL" });
    if (videoUrl) list.push({ src: videoUrl, type: "video/mp4" });
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

  /* ============================================================
     ENCRYPTION UTILITIES
  ============================================================ */
  const getEncryptionKey = (userId: string) => {
    // Use first 16 chars of userId as encryption key
    return userId.substring(0, 16).padEnd(16, '0');
  };

  const saveUnsyncedDelta = () => {
    const val = sessionDeltaRef.current;
    if (val === 0) return;
    
    // ✅ SECURE: Encrypt before storing
    const encrypted = CryptoJS.AES.encrypt(
      val.toString(),
      getEncryptionKey(userId)
    ).toString();
    
    secureStorage.setItemTracked(`unsynced-delta-${lessonId}`, encrypted);
    setCookie(`unsynced-delta-${lessonId}`, encrypted);
  };

  const loadUnsyncedDelta = (): number => {
    // Check localStorage first, then cookie
    const localData = secureStorage.getItem(`unsynced-delta-${lessonId}`);
    const encryptedData = localData || getCookie(`unsynced-delta-${lessonId}`);
    
    if (!encryptedData) return 0;
    
    try {
      // ✅ SECURE: Decrypt
      const decrypted = CryptoJS.AES.decrypt(
        encryptedData,
        getEncryptionKey(userId)
      ).toString(CryptoJS.enc.Utf8);
      
      return parseFloat(decrypted) || 0;
    } catch (e) {
      // If decryption fails (tampering detected), return 0
      console.warn('[Security] Failed to decrypt delta, possible tampering');
      return 0;
    }
  };

  const clearLocalDelta = () => {
    sessionDeltaRef.current = 0;
    secureStorage.removeItemTracked(`unsynced-delta-${lessonId}`);
    deleteCookie(`unsynced-delta-${lessonId}`);
  };

  /* ============================================================
     SYNC TO DATABASE
  ============================================================ */
  const syncToDB = async (specificLessonId?: string, delta?: number, position?: number) => {
    const targetId = specificLessonId || lessonId;
    const currentPosition = position !== undefined ? position : lastPositionRef.current;
    
    // Calculate final delta from accumulated video progress
    let deltaToSync = 0;
    if (delta !== undefined) {
      deltaToSync = Math.round(delta);
    } else {
      deltaToSync = Math.round(sessionDeltaRef.current);
    }

    if (deltaToSync === 0 && position === undefined) return;

    console.log(`[Sync] Syncing ${targetId}: Position ${currentPosition}, Delta ${deltaToSync}`);
    
    // ✅ Send consumed video duration to DB
    const response = await updateVideoProgress(targetId, currentPosition, deltaToSync);

    if (response.status === "success" && !specificLessonId) {
      // ✅ Clear local state only after successful sync for current lesson
      clearLocalDelta();
      sessionDeltaRef.current = 0;
    } else if (response.status === "success" && specificLessonId) {
        // Clear specific lesson delta
        secureStorage.removeItemTracked(`unsynced-delta-${specificLessonId}`);
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
      sessionDeltaRef.current = previousDelta; // load into active ref
      
      const savedTime = secureStorage.getItem(`video-progress-${lessonId}`);
      const positionToSync = savedTime ? parseFloat(savedTime) : initialTime;
      
      if (previousDelta > 0 || (savedTime && parseFloat(savedTime) > initialTime)) {
        await syncToDB(lessonId, previousDelta, positionToSync);
      }

      // 2. Global Sync: Find other unsynced deltas in localStorage
      try {
        const keys = secureStorage.keysByPrefix("unsynced-delta-");
        for (const key of keys) {
          if (!key.includes(lessonId)) {
            const otherLessonId = key.replace("unsynced-delta-", "");
            const rawDelta = secureStorage.getItem(key);
            const rawPos = secureStorage.getItem(`video-progress-${otherLessonId}`);
            // Decrypt the delta (it was double-encrypted)
            let otherDelta = 0;
            try {
              if (rawDelta) {
                const decrypted = CryptoJS.AES.decrypt(rawDelta, getEncryptionKey(userId)).toString(CryptoJS.enc.Utf8);
                otherDelta = parseFloat(decrypted) || 0;
              }
            } catch {}
            const otherPosition = rawPos ? parseFloat(rawPos) : 0;
            
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

    // ✅ Equivalent Progress: Track delta in video time
    if (delta > 0 && delta < 2) {
      sessionDeltaRef.current += delta;
      
      // Heartbeat save to storage every 10 video seconds
      if (Math.round(sessionDeltaRef.current) % 10 === 0) {
        saveUnsyncedDelta();
      }
    }
    
    lastPositionRef.current = currentPos;
  };

  /* ============================================================
     PERSISTENCE HEARTBEAT (Position Only)
  ============================================================ */
  useEffect(() => {
    const interval = setInterval(() => {
      // We only heartbeat the position now, delta is session-based
      if (document.visibilityState === "visible") {
        saveProgress(lastPositionRef.current);
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
      // 1. Setup HLS URL (Now signed from private bucket)
      const baseKey = videoKey.startsWith('hls/') 
        ? videoKey.split('/')[1] 
        : videoKey.replace(/\.[^/.]+$/, "");

      const hlsKey = `hls/${baseKey}/master.m3u8`;
      const hlsResponse = await getSignedVideoUrl(hlsKey) as any;
      if (hlsResponse && hlsResponse.status === "success" && hlsResponse.url) {
        setHlsUrl(hlsResponse.url);
      }

      // 2. Setup Video URL
      const response = await getSignedVideoUrl(videoKey) as any;
      if (response && response.status === "success" && response.url) {
        setVideoUrl(response.url);
      }

      // 3. Setup Caption URL (Now signed from private bucket if it's an internal key)
      if (transcriptionUrl) {
        console.log("[CourseContent] Using DB Transcription URL:", transcriptionUrl);
        
        // If it's a relative path/key, sign it. If it's already a full URL (HTTPS), use as is.
        if (transcriptionUrl.startsWith('http')) {
          setCaptionUrl(transcriptionUrl);
        } else {
          const captionResponse = await getSignedVideoUrl(transcriptionUrl) as any;
          if (captionResponse && captionResponse.status === "success" && captionResponse.url) {
            setCaptionUrl(captionResponse.url);
          }
        }
      } else {
        // No transcription available — pass undefined to skip captions
        setCaptionUrl(undefined);
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
    secureStorage.setItemTracked(`video-progress-${lessonId}`, time.toString());
  };

  const onLoadedMetadata = (duration: number) => {
    // No-op for now as CustomPlayer handles seeking initially
  };

  const onTimeUpdate = (currentTime: number) => {
    // ✅ Track coverage
    trackCoverage(currentTime);

    // Save position for resume (every 5 seconds)
    const lastSavedTime = parseFloat(
      secureStorage.getItem(`video-progress-${lessonId}`) || "0"
    );

    if (Math.abs(currentTime - lastSavedTime) > 5) {
      saveProgress(currentTime);
    }
  };

  /* ============================================================
     VIDEO EVENT HANDLERS
  ============================================================ */
  const onPlay = () => {
    // Starting position is already tracked by onTimeUpdate
  };

  const onPause = () => {
    // Save current breadcrumb to localStorage
    saveProgress(lastPositionRef.current);
  };

  const onEnded = () => {
    syncToDB();
  };


  /* ============================================================
     UI STATES
  ============================================================ */
  if (!videoKey) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center border relative group overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 bg-background/50">
            <BookIcon className="size-16 text-primary/40 mb-4 animate-pulse" />
            <p className="text-muted-foreground font-medium">This lesson does not have a video yet</p>
        </div>
      </div>
    );
  }

  if (!videoUrl && !hlsUrl) {
    return (
        <div className="aspect-video bg-muted rounded-lg border flex items-center justify-center relative overflow-hidden">
            <Skeleton className="absolute inset-0 w-full h-full" />
            <Loader size={40} className="z-10" />
        </div>
    );
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
          captionUrl={captionUrl}
          spriteMetadata={spriteMetadata ? { ...spriteMetadata, initialCues: vttCues } : undefined}
          className="w-full h-full"
        />
      )}
    </div>
  );
}

export function CourseContent({ lessonId, userId, initialLesson, initialVersion }: iAppProps) {
  const [mounted, setMounted] = useState(false);

  // Sync initialData to local storage on mount (Legacy/SSR support)
  useEffect(() => {
    setMounted(true);
    if (initialLesson && initialVersion) {
        const cacheKey = `lesson_content_${lessonId}`;
        chatCache.set(cacheKey, { lesson: initialLesson }, userId, initialVersion, PERMANENT_TTL);
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
        console.log(`[Lesson] LOCAL HIT (v${clientVersion}) - Server: NOT_MODIFIED`);
        return cached.data.lesson;
      }

      if (result && !(result as any).status) {
        console.log(`[Lesson] NEW_DATA -> Updating cache for ${lessonId}`);
        chatCache.set(cacheKey, result, userId, (result as any).version, PERMANENT_TTL);
        return (result as any).lesson;
      }
      return (result as any)?.lesson || cached?.data?.lesson;
    },
    initialData: () => {
        // ⭐ PRIORITY 1: Local Cache (For instant render)
        const cacheKey = `lesson_content_${lessonId}`;
        const cached = typeof window !== "undefined" ? chatCache.get<any>(cacheKey, userId) : null;
        if (cached) {
            console.log(`[Lesson] HYDRATION HIT (v${cached.version}) for ${lessonId}`);
            return cached.data.lesson;
        }

        // ⭐ PRIORITY 2: Server-provided data (if any)
        return initialLesson;
    },
    staleTime: 1800000, // 30 minutes (Smart Sync interval)
    refetchInterval: 1800000,
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const { triggerConfetti } = useConfetti2();
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isMobileDescriptionOpen, setIsMobileDescriptionOpen] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(false);

  // Assessment State
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [isLoadingMCQs, setIsLoadingMCQs] = useState(true);

  useEffect(() => {
    const fetchMCQs = async () => {
      setIsLoadingMCQs(true);
      try {
        const cacheKey = `lesson_mcqs_${lessonId}`;
        const cached = chatCache.get<any[]>(cacheKey, userId);

        if (cached) {
          console.log(`[MCQ Cache] Hit for lesson ${lessonId}`);
          setQuestions(cached.data);
          setIsLoadingMCQs(false);
          return;
        }

        const res = await getLessonMCQs(lessonId);
        if (res.success && res.questions) {
          setQuestions(res.questions);
          // Cache for 6 hours
          chatCache.set(cacheKey, res.questions, userId, undefined, PERMANENT_TTL);
        } else {
          setQuestions([]);
        }
      } catch (error) {
        setQuestions([]);
      } finally {
        setIsLoadingMCQs(false);
      }
    };
    fetchMCQs();
  }, [lessonId, userId]);


  useEffect(() => {
    setIsDescriptionOpen(false);
    setIsMobileDescriptionOpen(false);
  }, [lessonId]);

  if (!mounted || (isLoading && !lesson)) {
      return <LessonContentSkeleton />;
  }

  if (!lesson) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center opacity-40">
            <BookIcon size={64} className="mb-4" />
            <h2 className="text-xl font-black uppercase tracking-widest">Lesson Not Available</h2>
            <p className="text-sm">Please check your internet connection or contact support.</p>
        </div>
    );
  }

  const data = lesson;

  function onSubmit() {
    if (isLoadingMCQs) return;

    // If there's a quiz, open the modal instead of completing instantly
    if (questions.length > 0) {
      setIsAssessmentOpen(true);
      return;
    }

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
            `user_dashboard_${userId}`,
            `lesson_mcqs_${lessonId}`
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

  const isCompleted = optimisticCompleted || lesson?.lessonProgress?.some((p: any) => p.completed);
  const quizPassed = lesson?.lessonProgress?.some((p: any) => p.quizPassed);
  const hasVideo = Boolean(data.videoKey);

  return (
    <div className="relative flex flex-col md:flex-row bg-background h-full overflow-hidden md:border-l border-border ">
      <div className="flex-1 flex flex-col md:pl-6 overflow-y-auto ">
        <div className="order-1 md:order-1 w-full relative">
          <VideoPlayer
            thumbnailkey={data.thumbnailKey ?? ""}
            videoKey={data.videoKey ?? ""}
            lessonId={data.id}
            userId={userId}
            initialTime={data.lessonProgress?.[0]?.lastWatched ?? 0}
            spriteKey={data.spriteKey}
            spriteCols={data.spriteCols}
            spriteRows={data.spriteRows}
            spriteInterval={data.spriteInterval}
            spriteWidth={data.spriteWidth}
            spriteHeight={data.spriteHeight}
            lowResKey={data.lowResKey}
            transcriptionUrl={data.transcription?.vttUrl}
          />
        </div>

        <div className="hidden md:block order-3 md:order-2 pt-6 md:pt-3 md:pb-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
            {data.title}
          </h1>
        </div>

        {/* MOBILE ONLY: SIMPLIFIED HEADER (Completion Button Left, Description Arrow Right) */}
        <div className="md:hidden order-2 flex items-center justify-between py-4 bg-background ">
           <div className="flex items-center gap-2">
               <Button 
                  disabled={isPending || isLoadingMCQs || !hasVideo} 
              onClick={onSubmit} 
               variant={"outline"}
                  size="sm"
                  className={cn(
                    "gap-2 rounded-full px-5 h-9 font-bold text-xs uppercase tracking-tight shadow-[0_2px_10px_rgba(var(--primary),0.2)]",
                  )}
                >
                  {isLoadingMCQs ? (
                    <Loader size={16} />
                  ) : hasVideo ? (
                    <>
                      <CheckCircle className="size-4" />
                      {isCompleted ? "Assessment" : "Start Assessment"}
                    </>
                  ) : (
                    "No Video"
                  )}
                </Button>
           </div>

           <Drawer open={isMobileDescriptionOpen} onOpenChange={setIsMobileDescriptionOpen}>
              <DrawerTrigger asChild>
                 <Button variant="ghost" size="icon" className="text-muted-foreground rounded-full bg-muted transition-colors">
                    <ChevronRight className="size-6 ml-0.5" />
                 </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh] bg-background">
                 <div className="mx-auto w-full max-w-lg flex flex-col h-full overflow-hidden">
                    {/* Accessibility: DrawerTitle is required */}
                    <DrawerTitle className="sr-only">Lesson Description</DrawerTitle>
                    <div className="flex-1 overflow-y-auto px-6 pt-8 pb-12 overscroll-contain" data-lenis-prevent>
                       <div className="prose prose-sm dark:prose-invert max-w-none">
                          <h3 className="text-xl font-bold mb-4">{data.title}</h3>
                          {data.description && <RenderDescription json={JSON.parse(data.description)} />}
                       </div>
                    </div>
                 </div>
              </DrawerContent>
           </Drawer>
        </div>

        <div className="hidden md:flex order-3 md:order-3 items-center justify-between gap-4 px-4 md:px-0 pt-6 md:pt-6 md:pb-0 md:border-t mb-0">
          <div className="flex items-center gap-2">
            <Button 
              disabled={isPending || isLoadingMCQs || !hasVideo} 
              onClick={onSubmit}
              variant={"outline"}
              className={cn(
                "gap-2 rounded-full px-6",
         
              )}
            >
              {isLoadingMCQs ? (
                 <Loader size={16} />
              ) : hasVideo ? (
                <>
                  <CheckCircle className="size-4" />
                  {isCompleted ? "Assessment" : "Start Assessment"}
                </>
              ) : (
                "No Video Available"
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isDescriptionOpen ? "secondary" : "outline"}
              className="gap-2 shrink-0 rounded-full"
              onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
            >
              <IconFileText className="size-4" />
              {isDescriptionOpen ? "Hide Description" : "View Description"}
            </Button>
          </div>
        </div>
      </div>

      {data.description && isDescriptionOpen && (
        <div className="absolute -bottom-1 left-6 right-0 h-[85vh] z-30 hidden md:flex flex-col border border-border shadow-2xl bg-background animate-in slide-in-from-bottom duration-500 overflow-hidden rounded-t-3xl">
          <div className="flex items-center justify-between p-5 border-b border-border shrink-0 bg-muted/30">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <IconFileText className="size-5 text-primary" />
              Description
            </h2>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsDescriptionOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain scrollbar-thin scrollbar-thumb-primary/10"
            data-lenis-prevent
          >
            <h3 className="text-base font-bold mb-4">{data.title}</h3>
            <RenderDescription json={JSON.parse(data.description!)} />
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <AssessmentModal 
          isOpen={isAssessmentOpen}
          onClose={() => setIsAssessmentOpen(false)}
          questions={questions}
          lessonId={data.id}
          slug={data.Chapter.Course.slug}
          initialPassed={quizPassed}
          onSuccess={() => {
            setOptimisticCompleted(true);
            triggerConfetti();
            setIsAssessmentOpen(false);

            // ✅ Invalidate ALL relevant Redis caches immediately
            const slug = data.Chapter.Course.slug;
            const cacheKeys = [
                `lesson_content_${lessonId}`,
                `course_sidebar_${slug}`,
                `user_dashboard_${userId}`,
                `lesson_mcqs_${lessonId}`
            ];

            // 1. Clear LocalStorage
            cacheKeys.forEach(key => chatCache.invalidate(key, userId));

            // 2. Invalidate React Query
            queryClient.invalidateQueries({ queryKey: ["lesson_content", lessonId] });
            queryClient.invalidateQueries({ queryKey: ["course_sidebar", slug] });
            queryClient.invalidateQueries({ queryKey: ["user_dashboard", userId] });
          }}
        />
      )}
    </div>
  );
}
