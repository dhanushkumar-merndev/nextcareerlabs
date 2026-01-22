"use client";

import { LessonContentType } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { BookIcon, CheckCircle, X } from "lucide-react";
import { markLessonComplete, updateVideoProgress } from "../actions";
import { toast } from "sonner";
import { useEffect, useRef, useState, useTransition } from "react";
import { getSignedVideoUrl } from "@/app/data/course/get-signed-video-url";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { IconFileText } from "@tabler/icons-react";
import Hls from "hls.js";
import { env } from "@/lib/env";

interface iAppProps {
  data: LessonContentType;
}

function VideoPlayer({
  thumbnailkey,
  videoKey,
  lessonId,
  initialTime = 0,
}: {
  thumbnailkey: string;
  videoKey: string;
  lessonId: string;
  initialTime?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  // Track video coverage delta
  const lastPositionRef = useRef<number>(initialTime);
  const unsyncedDeltaRef = useRef<number>(0);
  const hasSyncedOnMountRef = useRef<boolean>(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);

  const thumbnailUrl = useConstructUrl(thumbnailkey);

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
  const syncToDB = async () => {
    const currentPosition = videoRef.current?.currentTime || 0;
    const deltaToSync = Math.round(unsyncedDeltaRef.current);

    if (deltaToSync === 0) return;

    // ✅ Send consumed video duration to DB
    const response = await updateVideoProgress(lessonId, currentPosition, deltaToSync);

    if (response.status === "success") {
      // ✅ Clear local state only after successful sync
      clearLocalDelta();
    }
  };

  /* ============================================================
     ON MOUNT: Load from localStorage/cookie and sync to DB
  ============================================================ */
  useEffect(() => {
    if (hasSyncedOnMountRef.current) return;
    hasSyncedOnMountRef.current = true;

    // Load unsynced delta and last saved position from previous session
    const previousDelta = loadUnsyncedDelta();
    const savedTime = localStorage.getItem(`video-progress-${lessonId}`);
    const positionToSync = savedTime ? parseFloat(savedTime) : initialTime;
    
    // ✅ Flush any unsynced data to DB on mount
    if (previousDelta > 0 || (savedTime && parseFloat(savedTime) > initialTime)) {
      updateVideoProgress(lessonId, positionToSync, Math.round(previousDelta)).then((res) => {
        if (res.status === "success") {
          clearLocalDelta();
        }
      });
    }
  }, [lessonId, initialTime]);

  /* ============================================================
     TRACK WATCHED SECONDS (Every second during playback)
  ============================================================ */
  const trackCoverage = () => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;

    // 🔴 Multi-tab safety: Only track if the page is active
    if (document.visibilityState !== "visible") return;

    const currentPos = video.currentTime;
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
      const video = videoRef.current;
      if (video && !video.paused && !video.ended && document.visibilityState === "visible") {
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

    const hlsKey = `hls/${videoKey.replace(/\.[^/.]+$/, "")}/master.m3u8`;
    const hlsFullUrl = `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${hlsKey}`;

    setHlsUrl(hlsFullUrl);
  }, [videoKey]);

  /* ============================================================
     INIT HLS PLAYER
  ============================================================ */
  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return;

    const video = videoRef.current;

    // Safari (native HLS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.currentTime = initialTime;
      return;
    }

    // Chrome / Firefox / Edge
    if (Hls.isSupported()) {
      hlsRef.current?.destroy();

      const savedTime = parseFloat(
        localStorage.getItem(`video-progress-${lessonId}`) || initialTime.toString()
      );
      const hls = new Hls({ startPosition: savedTime });
      hlsRef.current = hls;

      video.currentTime = savedTime;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels.map((_, i) => i));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
          setHlsUrl(null);
          getSignedVideoUrl(videoKey).then(setVideoUrl);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [hlsUrl, videoKey, initialTime, lessonId]);

  /* ============================================================
     ON UNMOUNT: Sync to DB
  ============================================================ */
  useEffect(() => {
    return () => {
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

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [lessonId]);

  /* ============================================================
     VIDEO POSITION TRACKING (localStorage for resume)
  ============================================================ */
  const saveProgress = (time: number) => {
    localStorage.setItem(`video-progress-${lessonId}`, time.toString());
  };

  const onLoadedMetadata = () => {
    const savedTime = localStorage.getItem(`video-progress-${lessonId}`);
    const timeToSeek = savedTime ? parseFloat(savedTime) : initialTime;

    if (videoRef.current) {
      videoRef.current.currentTime = timeToSeek;
    }
  };

  const onTimeUpdate = () => {
    if (!videoRef.current) return;

    const currentTime = videoRef.current.currentTime;
    
    // ✅ Track coverage
    trackCoverage();

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
    // Sync initial position
    if (videoRef.current) {
      lastPositionRef.current = videoRef.current.currentTime;
    }
  };

  const onPause = () => {
    saveUnsyncedDelta();
    // ❌ Removed syncToDB() here to reduce server calls
  };

  const onEnded = () => {
    saveUnsyncedDelta();
    syncToDB(); // Keep sync on end just in case, or remove if user strictly wants refresh/exit only
  };

  const onWaiting = () => {
    // Don't stop auto-save during buffering, just stop tracking
  };

  /* ============================================================
     QUALITY SWITCH
  ============================================================ */
  const changeQuality = (level: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = level;
    setCurrentLevel(level);
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
    <div className="relative aspect-video bg-muted rounded-lg border overflow-hidden">
      {levels.length > 0 && (
        <select
          value={currentLevel}
          onChange={(e) => changeQuality(Number(e.target.value))}
          className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground text-sm font-medium rounded-md px-3 py-1 shadow-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value={-1}>Auto</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {hlsRef.current?.levels[l]?.height}p
            </option>
          ))}
        </select>
      )}

      <video
        ref={videoRef}
        data-lenis-prevent
        className="w-full h-full object-contain accent-primary"
        controls
        preload="none"
        playsInline
        poster={thumbnailUrl}
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        crossOrigin="anonymous"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onWaiting={onWaiting}
      >
        {!hlsUrl && videoUrl && <source src={videoUrl} type="video/mp4" />}
        Your browser does not support HTML5 video.
      </video>
    </div>
  );
}

export function CourseContent({ data }: iAppProps) {
  const [isPending, startTransition] = useTransition();
  const { triggerConfetti } = useConfetti2();
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(false);

  useEffect(() => {
    setIsDescriptionOpen(false);
  }, [data.id]);

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
        // Success
      } else {
        setOptimisticCompleted(false);
        toast.error(result.message);
      }
    });
  }

  const isCompleted = optimisticCompleted || data.lessonProgress?.length > 0;
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