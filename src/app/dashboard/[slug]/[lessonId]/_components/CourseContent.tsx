"use client";

import { getLessonContent } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { constructUrl } from "@/hooks/use-construct-url";
import { BookIcon, Bot, CheckCircle, ChevronRight, Lock, Sparkles, X } from "lucide-react";
import { updateVideoProgress, updateMultipleVideoProgress } from "../actions";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { getBatchSignedVideoUrls } from "@/app/data/course/get-signed-video-url";
import { env } from "@/lib/env";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatCache, PERMANENT_TTL } from "@/lib/chat-cache";
import { secureStorage } from "@/lib/secure-storage";
import { VideoPlayer as CustomPlayer } from "@/components/video-player/VideoPlayer";
import CryptoJS from "crypto-js";
import Link from "next/link";

import { AssessmentModal } from "./AssessmentModal";

import { Skeleton } from "@/components/ui/skeleton";
import Loader from "@/components/ui/Loader";
import { toast } from "sonner";
import { LessonContentSkeleton } from "./lessonSkeleton";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { IconFileText } from "@tabler/icons-react";
import { TriangleAlert } from "lucide-react";
import { SupportTicketDialog } from "@/app/(users)/_components/SupportTicketDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FloatingChat } from "@/components/ai-chat/FloatingChat";
import { checkAndInvalidateAssessmentEligibility } from "../invalidate-assessment";

interface Question {
  id: string;
  question: string;
  options: string[];
  correctIdx?: number;
  explanation?: string | null;
}

interface LessonProgressData {
  completed: boolean;
  quizPassed: boolean;
  lessonId: string;
  lastWatched: number;
  actualWatchTime: number;
  restrictionTime: number;
}

interface VttCue {
  startTime: number;
  endTime: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LessonContentData {
  lesson: {
    id: string;
    title: string;
    description?: string | null;
    videoKey?: string;
    duration: number;
    thumbnailKey?: string;
    spriteKey?: string | null;
    spriteCols?: number | null;
    spriteRows?: number | null;
    spriteInterval?: number | null;
    spriteWidth?: number | null;
    spriteHeight?: number | null;
    lowResKey?: string | null;
    transcription?: { vttUrl?: string } | null;
    Chapter?: {
      id: string;
      courseId: string;
      Course: {
        id: string;
        slug: string;
        title?: string;
        isFree: boolean;
        freeChaptersCount?: number;
      };
    };
    lessonProgress?: LessonProgressData[];
  };
  questions?: Question[];
  version?: string;
}

interface LockedContentData {
  status: "locked";
  message: string;
  courseSlug: string;
  courseTitle: string;
  version?: string;
}

interface iAppProps {
  lessonId: string;
  userId: string;
}

const EMPTY_ARRAY: Question[] = [];

// VideoPlayer is defined as a separate top-level component (not inside CourseContent)
// to ensure React maintains a stable identity across renders
const ONE_DAY_TTL = 24 * 60 * 60 * 1000;
const ONE_YEAR_TTL = 365 * 24 * 60 * 60 * 1000;
const PROGRESS_WRITE_INTERVAL_MS = 5000;
const DELTA_WRITE_INTERVAL_MS = 10000;

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
  isCompleted,
  setOptimisticCompleted,
  initialRestrictionTime = 0,
  durationInSec,
  slug,
  seekSignal,
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
  isCompleted?: boolean;
  setOptimisticCompleted: (val: boolean) => void;
  initialRestrictionTime?: number;
  durationInSec: number;
  slug: string;
  isFree?: boolean;
  seekSignal?: { time: number; key: number } | null;
  seekKey?: number;
}) {
  console.log("[DEBUG] VideoPlayer render", { lessonId, videoKey: !!videoKey });
  const thumbnailUrl = constructUrl(thumbnailkey);
  const spriteUrl = constructUrl(spriteKey || "");
  const lowResUrl = constructUrl(lowResKey || "");
  const queryClient = useQueryClient();
  const [vttCues, setVttCues] = useState<VttCue[]>([]);
  const lessonIdRef = useRef(lessonId);
  useEffect(() => {
    lessonIdRef.current = lessonId;
  }, [lessonId]);

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
        cols: 0,
        rows: 0,
        interval: 0,
        width: 0,
        height: 0,
      };
    }

    return undefined;
  }, [spriteKey, videoKey, spriteUrl, lowResUrl, spriteCols, spriteRows, spriteInterval, spriteWidth, spriteHeight]);

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
        const parsedCues: VttCue[] = [];
        let currentCue: Partial<VttCue> = {};

        lines.forEach((line) => {
          line = line.trim();
          if (line === "WEBVTT" || line === "") return;

          if (line.includes("-->")) {
            const [start, end] = line.split("-->").map((t) => {
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
            parsedCues.push(currentCue as VttCue);
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
  const lastSavedDeltaRef = useRef<number>(0);
  const lastProgressSaveTimeRef = useRef<number>(initialTime);
  const lastProgressWriteAtRef = useRef<number>(0);
  const lastRestrictionWriteAtRef = useRef<number>(0);
  const lastDeltaWriteAtRef = useRef<number>(0);
  const hasSyncedOnMountRef = useRef<boolean>(false);
  const isSyncingRef = useRef<boolean>(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [captionUrl, setCaptionUrl] = useState<string | undefined>(undefined);
  const [actualDuration, setActualDuration] = useState<number>(0);

  // ✅ Refs to avoid stale closures in onTimeUpdate while keeping callback stable
  const isCompletedRef = useRef(isCompleted);
  const actualDurationRef = useRef(0);
  const durationInSecRef = useRef(durationInSec);
  const slugRef = useRef(slug);
  const setOptimisticCompletedRef = useRef(setOptimisticCompleted);

  useEffect(() => {
    isCompletedRef.current = isCompleted;
  }, [isCompleted]);
  useEffect(() => {
    actualDurationRef.current = actualDuration;
  }, [actualDuration]);
  useEffect(() => {
    durationInSecRef.current = durationInSec;
  }, [durationInSec]);
  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);
  useEffect(() => {
    setOptimisticCompletedRef.current = setOptimisticCompleted;
  }, [setOptimisticCompleted]);

  const [resumeTime, setResumeTime] = useState(initialTime);
  useEffect(() => {
    const localProgress = secureStorage.getItem(`video-progress-${lessonId}_${userId}`);
    const needsSync =
      secureStorage.getItem(`needs-sync-${lessonId}_${userId}`) === "true";

    if (localProgress) {
      const parsedLocal = parseFloat(localProgress);
      // ✅ TRUST local intent if a sync was interrupted (needsSync), otherwise use Math.max for cross-device safety
      setResumeTime(
        needsSync ? parsedLocal : Math.max(initialTime, parsedLocal),
      );
    } else {
      setResumeTime(initialTime);
    }
  }, [lessonId, initialTime, userId]);
  
  // ✅ Restriction time: localStorage high-water mark
  const restrictionTimeRef = useRef<number>(initialRestrictionTime);
  useEffect(() => {
    const localRestriction = parseFloat(
      secureStorage.getItem(`restriction-time-${lessonId}_${userId}`) || "0",
    );
    const effective = Math.max(initialRestrictionTime, localRestriction);
    restrictionTimeRef.current = effective;
    // Persist so we always have the highest known
    secureStorage.setItemTracked(
      `restriction-time-${lessonId}_${userId}`,
      effective.toString(),
    );
  }, [lessonId, initialRestrictionTime, userId]);

  const sources = useMemo(() => {
    const list = [];
    if (hlsUrl) list.push({ src: hlsUrl, type: "application/x-mpegURL" });
    if (videoUrl) list.push({ src: videoUrl, type: "video/mp4" });
    return list;
  }, [hlsUrl, videoUrl]);

  const fullSpriteMetadata = useMemo(() => {
    if (!spriteMetadata) return undefined;
    return { ...spriteMetadata, initialCues: vttCues };
  }, [spriteMetadata, vttCues]);

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
    return userId.substring(0, 16).padEnd(16, "0");
  };

  const saveUnsyncedDelta = useCallback((force = false) => {
    const val = sessionDeltaRef.current;
    if (val === 0) return;
    const now = Date.now();
    if (!force && now - lastDeltaWriteAtRef.current < DELTA_WRITE_INTERVAL_MS) {
      return;
    }
    lastDeltaWriteAtRef.current = now;

    // ✅ SECURE: Encrypt before storing
    const encrypted = CryptoJS.AES.encrypt(
      val.toString(),
      getEncryptionKey(userId),
    ).toString();

    secureStorage.setItemTracked(`unsynced-delta-${lessonId}_${userId}`, encrypted);
    setCookie(`unsynced-delta-${lessonId}_${userId}`, encrypted);
  }, [lessonId, userId]);

  const loadUnsyncedDelta = (): number => {
    // Check localStorage first, then cookie
    const localData = secureStorage.getItem(`unsynced-delta-${lessonId}_${userId}`);
    const encryptedData = localData || getCookie(`unsynced-delta-${lessonId}_${userId}`);

    if (!encryptedData) return 0;

    try {
      // ✅ SECURE: Decrypt
      const decrypted = CryptoJS.AES.decrypt(
        encryptedData,
        getEncryptionKey(userId),
      ).toString(CryptoJS.enc.Utf8);

      return parseFloat(decrypted) || 0;
    } catch {
      // If decryption fails (tampering detected), return 0
      console.warn("[Security] Failed to decrypt delta, possible tampering");
      return 0;
    }
  };

  const clearLocalDelta = useCallback(() => {
    sessionDeltaRef.current = 0;
    lastSavedDeltaRef.current = 0;
    secureStorage.removeItemTracked(`unsynced-delta-${lessonId}_${userId}`);
    deleteCookie(`unsynced-delta-${lessonId}_${userId}`);
  }, [lessonId, userId]);

  /* ============================================================
     VIDEO POSITION TRACKING (localStorage for resume)
  ============================================================ */
  const saveProgress = useCallback((time: number, force = false) => {
    const now = Date.now();
    if (
      !force &&
      Math.abs(time - lastProgressSaveTimeRef.current) < 5 &&
      now - lastProgressWriteAtRef.current < PROGRESS_WRITE_INTERVAL_MS
    ) {
      return;
    }
    lastProgressSaveTimeRef.current = time;
    lastProgressWriteAtRef.current = now;
    secureStorage.setItemTracked(`video-progress-${lessonId}_${userId}`, time.toString());
    secureStorage.setItemTracked(`needs-sync-${lessonId}_${userId}`, "true"); // Mark dirty
  }, [lessonId, userId]);

  /* ============================================================
     SYNC TO DATABASE
  ============================================================ */
  const syncToDB = useCallback(async (
    specificLessonId?: string,
    delta?: number,
    position?: number,
  ) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const targetId = specificLessonId || lessonId;
      const currentPosition =
        position !== undefined ? position : lastPositionRef.current;

      // Calculate final delta from accumulated video progress
      let deltaToSync = 0;
      if (delta !== undefined) {
        deltaToSync = delta;
      } else {
        deltaToSync = sessionDeltaRef.current;
      }

      if (deltaToSync === 0 && position === undefined) return;

      console.log(
        `[Sync] Syncing ${targetId}: Position ${currentPosition}, Delta ${deltaToSync}`,
      );

      // ✅ Send consumed video duration to DB
      const response = await updateVideoProgress(
        targetId,
        currentPosition,
        deltaToSync,
        restrictionTimeRef.current,
      );

      if (response.status === "success" && !specificLessonId) {
        // ✅ Update LOCAL CACHE directly (No invalidation avoids network hit on refresh)
        const cacheKey = `lesson_content_${lessonId}`;
        const cached = chatCache.get<LessonContentData>(cacheKey, userId);
        if (cached?.data?.lesson) {
          const progress = cached.data.lesson.lessonProgress?.[0] || {
            completed: false,
            quizPassed: false,
            lessonId: targetId,
            lastWatched: 0,
            actualWatchTime: 0,
            restrictionTime: 0,
          };
          progress.lastWatched = currentPosition;
          progress.actualWatchTime =
            (progress.actualWatchTime || 0) + deltaToSync;
          progress.restrictionTime = Math.max(
            progress.restrictionTime || 0,
            restrictionTimeRef.current,
          );

          if (!cached.data.lesson.lessonProgress)
            cached.data.lesson.lessonProgress = [];
          cached.data.lesson.lessonProgress[0] = progress;

          chatCache.set(
            cacheKey,
            cached.data,
            userId,
            cached.version,
            PERMANENT_TTL,
          );
          queryClient.setQueryData(["lesson_content", lessonId], cached.data);
        }

        // ✅ Clear local state and mark as clean
        clearLocalDelta();
        secureStorage.removeItemTracked(`needs-sync-${lessonId}_${userId}`);
        sessionDeltaRef.current = 0;
      } else if (response.status === "success" && specificLessonId) {
        // Update specific lesson cache
        const cacheKey = `lesson_content_${specificLessonId}`;
        const cached = chatCache.get<LessonContentData>(cacheKey, userId);
        if (cached?.data?.lesson) {
          const progress = cached.data.lesson.lessonProgress?.[0] || {
            completed: false,
            quizPassed: false,
            lessonId: specificLessonId,
            lastWatched: 0,
            actualWatchTime: 0,
            restrictionTime: 0,
          };
          progress.lastWatched = currentPosition;
          progress.actualWatchTime =
            (progress.actualWatchTime || 0) + deltaToSync;
          // Note: for specificLessonId we don't have easy access to its restrictionTimeRef
          // but if it's the current lesson, restrictionTimeRef.current is accurate.
          if (specificLessonId === lessonId) {
            progress.restrictionTime = Math.max(
              progress.restrictionTime || 0,
              restrictionTimeRef.current,
            );
          }

          if (!cached.data.lesson.lessonProgress)
            cached.data.lesson.lessonProgress = [];
          cached.data.lesson.lessonProgress[0] = progress;

          chatCache.set(
            cacheKey,
            cached.data,
            userId,
            cached.version,
            PERMANENT_TTL,
          );
          queryClient.setQueryData(
            ["lesson_content", specificLessonId],
            cached.data,
          );
        }

        // Clear specific lesson delta and mark as clean
        secureStorage.removeItemTracked(`unsynced-delta-${specificLessonId}_${userId}`);
        secureStorage.removeItemTracked(`needs-sync-${specificLessonId}_${userId}`);
        const expires = new Date(0).toUTCString();
        document.cookie = `unsynced-delta-${specificLessonId}_${userId}=; expires=${expires}; path=/; SameSite=Lax`;
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [lessonId, userId, queryClient, clearLocalDelta]);

  /* ============================================================
     VIDEO EVENT HANDLERS (Memoized for stability)
  ============================================================ */
  const onLoadedMetadata = useCallback(
    (duration: number) => {
      setActualDuration(duration);
      // ✅ Save duration locally for real-time dashboard progress calculation (1 day TTL)
      chatCache.set(
        `duration_${lessonId}`,
        duration,
        userId,
        undefined,
        ONE_DAY_TTL,
      );
      secureStorage.setItemTracked(`duration-${lessonId}_${userId}`, duration.toString());
    },
    [lessonId, userId],
  );

  const onTimeUpdate = useCallback(
    (currentTime: number) => {
      // ✅ 1. Update Restriction Instantly (Fixes "5 sec slow")
      if (currentTime > restrictionTimeRef.current) {
        restrictionTimeRef.current = currentTime;
        const now = Date.now();
        if (now - lastRestrictionWriteAtRef.current >= PROGRESS_WRITE_INTERVAL_MS) {
          lastRestrictionWriteAtRef.current = now;
          secureStorage.setItemTracked(
            `restriction-time-${lessonId}_${userId}`,
            currentTime.toString(),
          );
          // ✅ Real-time dashboard override (1 day TTL)
          chatCache.set(
            `restriction_${lessonId}`,
            currentTime,
            userId,
            undefined,
            ONE_DAY_TTL,
          );
        }
      }

      // ✅ 2. Real-time Assessment Eligibility Check (90% threshold)
      const _isCompleted = isCompletedRef.current;
      const _actualDuration = actualDurationRef.current;
      const _durationInSec = durationInSecRef.current;
      const _slug = slugRef.current;
      const _setOptimisticCompleted = setOptimisticCompletedRef.current;

      if (
        !_isCompleted &&
        !hasTriggeredAssessmentCacheRef.current &&
        (_actualDuration > 0 || _durationInSec > 0)
      ) {
        const effectiveDuration =
          _actualDuration > 0 ? _actualDuration : _durationInSec;
        const threshold = effectiveDuration * 0.9;
        if (currentTime >= threshold) {
          // ── Tier 1: Check Local Cache FIRST ───────────────────────────
          const cacheKey = `assessment_eligible_${lessonId}`;
          const cached = chatCache.get<boolean>(cacheKey, userId);

          if (cached?.data === true) {
            console.log(
              `%c[AssessmentEligibility] 🟡 LOCAL CACHE HIT (Already Eligible) for Lesson=${lessonId}. Skipping Server Call.`,
              "color: #eab308; font-weight: bold",
            );
            hasTriggeredAssessmentCacheRef.current = true;
            _setOptimisticCompleted(true);
            return;
          }

          // ── Tier 2: Call Server & Cache Result ────────────────────────
          hasTriggeredAssessmentCacheRef.current = true;
          _setOptimisticCompleted(true);

          checkAndInvalidateAssessmentEligibility(lessonId, _slug)
            .then(() => {
              // Cache for 1 year so we never hit the server again for this lesson
              chatCache.set(cacheKey, true, userId, undefined, ONE_YEAR_TTL);
              console.log(
                `%c[AssessmentEligibility] 💾 CACHED eligibility locally (1 year) for Lesson=${lessonId}`,
                "color: #8b5cf6",
              );
            })
            .catch((e) => {
              console.error("[Eligibility] Error invalidating caches:", e);
              hasTriggeredAssessmentCacheRef.current = false;
            });
        }
      }

      // ✅ 3. Track Coverage Delta
      const delta = currentTime - lastPositionRef.current;
      if (delta > 0 && delta < 5.0) {
        // Multi-tab safety: Only track if page is active
        if (document.visibilityState === "visible") {
          sessionDeltaRef.current += delta;
        }
      }
      lastPositionRef.current = currentTime;

      // ✅ 3. Periodic Position Save (localStorage only - throttled)
      if (Math.abs(currentTime - lastProgressSaveTimeRef.current) >= 5) {
        saveProgress(currentTime);
        saveUnsyncedDelta();
      }
    },
    [lessonId, userId, saveProgress, saveUnsyncedDelta],
  );

  const onPlay = useCallback(() => {
    // Starting position is already tracked by onTimeUpdate
  }, []);

  const onPause = useCallback(() => {
    // Save current breadcrumb to localStorage
    saveProgress(lastPositionRef.current, true);
    saveUnsyncedDelta(true); // Ensure delta is saved on pause
  }, [saveProgress, saveUnsyncedDelta]);

  const onRestrictionUpdate = useCallback(
    (maxTime: number) => {
      if (maxTime > restrictionTimeRef.current) {
        restrictionTimeRef.current = maxTime;
        const now = Date.now();
        if (now - lastRestrictionWriteAtRef.current >= PROGRESS_WRITE_INTERVAL_MS) {
          lastRestrictionWriteAtRef.current = now;
          secureStorage.setItemTracked(
            `restriction-time-${lessonId}_${userId}`,
            maxTime.toString(),
          );
          // ✅ Real-time dashboard override (1 day TTL)
          chatCache.set(
            `restriction_${lessonId}`,
            maxTime,
            userId,
            undefined,
            ONE_DAY_TTL,
          );
        }
      }
    },
    [lessonId, userId],
  );

  const onEnded = useCallback(() => {
    syncToDB();
    // ✅ Unlock seeking immediately when video ends
    setOptimisticCompleted(true);
  }, [setOptimisticCompleted, syncToDB]);

  // const thumbnailUrl = useConstructUrl(thumbnailkey); // Removed duplicate

  /* ============================================================
     ON MOUNT: Load from localStorage/cookie and sync to DB
  ============================================================ */
  useEffect(() => {
    if (hasSyncedOnMountRef.current) return;
    hasSyncedOnMountRef.current = true;

    const performGlobalSync = async () => {
      // 1. Sync current lesson leftover
      const previousDelta = loadUnsyncedDelta();

      // ✅ CRITICAL: CLEAR STORAGE IMMEDIATELY to prevent doubling if another process/mount starts
      if (previousDelta > 0) {
        secureStorage.removeItemTracked(`unsynced-delta-${lessonId}_${userId}`);
        deleteCookie(`unsynced-delta-${lessonId}_${userId}`);
      }

      sessionDeltaRef.current = 0; // Start session delta at 0, previous is handled separately
      lastSavedDeltaRef.current = 0;

      const savedTime = secureStorage.getItem(`video-progress-${lessonId}_${userId}`);
      const needsSync =
        secureStorage.getItem(`needs-sync-${lessonId}_${userId}`) === "true";

      // ✅ Robust fallback: If we "need sync", trust the local saved time (intent).
      // Otherwise use server time + delta as a safe baseline.
      const positionToSync = needsSync
        ? savedTime
          ? parseFloat(savedTime)
          : initialTime
        : Math.max(
            initialTime + previousDelta,
            savedTime ? parseFloat(savedTime) : 0,
          );

      // ✅ Update THE REF IMMEDIATELY so subsequent time updates start from the SYNCED position
      lastPositionRef.current = positionToSync;
      console.log(
        `[Sync] Synced to ${positionToSync}, Delta: ${previousDelta}`,
      );

      // 2. Global Sync: Find other unsynced deltas in localStorage
      try {
        const keys = secureStorage.keysByPrefix(`unsynced-delta-`).filter(k => k.endsWith(`_${userId}`));
        const updatesToBatch: Array<{
          lessonId: string;
          lastWatched: number;
          delta: number;
          restrictionTime: number;
        }> = [];

        // Add current lesson to batch if it has a delta
        if (
          previousDelta > 0 ||
          (savedTime && parseFloat(savedTime) > initialTime)
        ) {
          updatesToBatch.push({
            lessonId,
            lastWatched: positionToSync,
            delta: previousDelta,
            restrictionTime: restrictionTimeRef.current,
          });
        }

        for (const key of keys) {
          if (!key.includes(lessonId)) {
            const otherLessonId = key.replace("unsynced-delta-", "").replace(`_${userId}`, "");
            const rawDelta = secureStorage.getItem(key);
            const rawPos = secureStorage.getItem(
              `video-progress-${otherLessonId}_${userId}`,
            );

            let otherDelta = 0;
            try {
              if (rawDelta) {
                const decrypted = CryptoJS.AES.decrypt(
                  rawDelta,
                  getEncryptionKey(userId),
                ).toString(CryptoJS.enc.Utf8);
                otherDelta = parseFloat(decrypted) || 0;
              }
            } catch {}
            const otherPosition = rawPos ? parseFloat(rawPos) : 0;

            const otherRestriction = parseFloat(
              secureStorage.getItem(`restriction-time-${otherLessonId}_${userId}`) || "0",
            );

            if (otherDelta > 0 || otherRestriction > 0) {
              updatesToBatch.push({
                lessonId: otherLessonId,
                lastWatched: otherPosition,
                delta: otherDelta,
                restrictionTime: otherRestriction,
              });
            }
          }
        }

        if (updatesToBatch.length > 0) {
          console.log(
            `[Global Sync] Batch syncing ${updatesToBatch.length} items`,
          );
          const res = await updateMultipleVideoProgress(updatesToBatch);
          if (res.status === "success") {
            // Clear all synced items and update their caches
            updatesToBatch.forEach((u) => {
              const cacheKey = `lesson_content_${u.lessonId}`;
              const cached = chatCache.get<LessonContentData>(cacheKey, userId);
              if (cached?.data?.lesson) {
                const progress = cached.data.lesson.lessonProgress?.[0] || {
                  completed: false,
                  quizPassed: false,
                  lessonId: u.lessonId,
                  lastWatched: 0,
                  actualWatchTime: 0,
                  restrictionTime: 0,
                };
                progress.lastWatched = u.lastWatched;
                progress.actualWatchTime =
                  (progress.actualWatchTime || 0) + u.delta;
                progress.restrictionTime = Math.max(
                  progress.restrictionTime || 0,
                  u.restrictionTime,
                );

                if (!cached.data.lesson.lessonProgress)
                  cached.data.lesson.lessonProgress = [];
                cached.data.lesson.lessonProgress[0] = progress;

                chatCache.set(
                  cacheKey,
                  cached.data,
                  userId,
                  cached.version,
                  PERMANENT_TTL,
                );
                queryClient.setQueryData(
                  ["lesson_content", u.lessonId],
                  cached.data,
                );
              }

              // ✅ Clear others (current was cleared immediately)
              if (u.lessonId !== lessonId) {
                secureStorage.removeItemTracked(`unsynced-delta-${u.lessonId}_${userId}`);
                deleteCookie(`unsynced-delta-${u.lessonId}_${userId}`);
              }
            });
          }
        }
      } catch (e) {
        console.error("[Global Sync] Error:", e);
      }
    };

    performGlobalSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, initialTime]);

  /* ============================================================
     EXIT PROTECTION: Save final delta and position on unload
  ============================================================ */
  useEffect(() => {
    const handleUnload = () => {
      if (sessionDeltaRef.current > 0) {
        saveUnsyncedDelta(true);
        saveProgress(lastPositionRef.current, true);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [saveProgress, saveUnsyncedDelta]);

  /* ============================================================
     TRACK WATCHED SECONDS
  ============================================================ */
  // trackCoverage merged into onTimeUpdate for better synchronization

  /* ============================================================
     PERSISTENCE HEARTBEAT (Position Only) + ASSESSMENT CHECK
  ============================================================ */
  const hasTriggeredAssessmentCacheRef = useRef<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        saveProgress(lastPositionRef.current);
      }
    }, PROGRESS_WRITE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [lessonId, isCompleted, durationInSec, slug, actualDuration, saveProgress]);

  /* ============================================================
     HLS + VIDEO + CAPTION URL SETUP (with local 28-min cache)
  ============================================================ */
  const urlCacheKey = `lesson_video_urls_${lessonId}`;
  // 28 min TTL — just under the 30-min S3 signed URL expiry
  const VIDEO_URL_TTL = 30 * 60 * 1000;

  useEffect(() => {
    if (!videoKey) return;

    const fetchUrls = async () => {
      // ── Tier 1: Local Cache (chatCache) ─────────────────────────────
      const cachedUrls = chatCache.get<{
        hls?: string;
        video?: string;
        caption?: string;
      }>(urlCacheKey, userId);
      if (cachedUrls) {
        console.log(
          "%c[■ Video] 🟡 LOCAL HIT → using cached signed URLs (no S3 call)",
          "color: #eab308; font-weight: bold",
        );
        if (cachedUrls.data.hls) setHlsUrl(cachedUrls.data.hls);
        if (cachedUrls.data.video) setVideoUrl(cachedUrls.data.video);
        if (cachedUrls.data.caption !== undefined)
          setCaptionUrl(cachedUrls.data.caption || undefined);
        return;
      }

      // ── Tier 2: Fetch new signed URLs from S3 ────────────────────────
      console.log(
        "%c[■ Video] 🗄️  FETCH NEW signed URLs from S3 (Batching)",
        "color: #f97316; font-weight: bold",
      );

      const baseKey = videoKey.startsWith("hls/")
        ? videoKey.split("/")[1]
        : videoKey.replace(/\.[^/.]+$/, "");
      const hlsKey = `hls/${baseKey}/master.m3u8`;

      const keysToSign = [hlsKey, videoKey];
      if (transcriptionUrl && !transcriptionUrl.startsWith("http")) {
        keysToSign.push(transcriptionUrl);
      }

      const batchResponse = (await getBatchSignedVideoUrls(
        keysToSign,
      )) as { status: string; urls?: Record<string, string>; message?: string };

      if (batchResponse?.status === "success" && batchResponse.urls) {
        const urls = batchResponse.urls;
        const urlsToCache: { hls?: string; video?: string; caption?: string } =
          {};

        if (urls[hlsKey]) {
          setHlsUrl(urls[hlsKey]);
          urlsToCache.hls = urls[hlsKey];
        }
        if (urls[videoKey]) {
          setVideoUrl(urls[videoKey]);
          urlsToCache.video = urls[videoKey];
        }

        if (transcriptionUrl) {
          if (transcriptionUrl.startsWith("http")) {
            setCaptionUrl(transcriptionUrl);
            urlsToCache.caption = transcriptionUrl;
          } else if (urls[transcriptionUrl]) {
            setCaptionUrl(urls[transcriptionUrl]);
            urlsToCache.caption = urls[transcriptionUrl];
          }
        }

        // ── Store in local cache (28 min TTL) ───────────────────────────
        chatCache.set(
          urlCacheKey,
          urlsToCache,
          userId,
          undefined,
          VIDEO_URL_TTL,
        );
        console.log(
          "%c[■ Video] 💾 CACHED signed URLs locally (28 min)",
          "color: #8b5cf6",
        );
      }
    };

    fetchUrls();
  }, [VIDEO_URL_TTL, transcriptionUrl, urlCacheKey, userId, videoKey]);

  /* ============================================================
     ON UNMOUNT: Sync to DB
  ============================================================ */
  useEffect(() => {
    return () => {
      // Final tracking call to capture the very last seconds
      syncToDB();
    };
  }, [lessonId, syncToDB]);

  /* ============================================================
     BEFOREUNLOAD: Save to both storages (Local + Cookie)
  ============================================================ */
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveUnsyncedDelta(true);
      saveProgress(lastPositionRef.current, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveUnsyncedDelta(true);
        saveProgress(lastPositionRef.current, true);
        syncToDB(); // Push to DB immediately on tab hide
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [lessonId, saveProgress, saveUnsyncedDelta, syncToDB]);

  /* ============================================================
     UI STATES
  ============================================================ */
  if (!videoKey) {
    console.log("[VideoPlayer] No videoKey, showing placeholder");
    return (
      <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center border relative group overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 bg-background/50">
          <BookIcon className="size-16 text-primary/40 mb-4 animate-shine" />
          <p className="text-muted-foreground font-medium">
            This lesson does not have a video yet
          </p>
        </div>
      </div>
    );
  }

  if (!videoUrl && !hlsUrl) {
    console.log("[VideoPlayer] Waiting for video URLs (loading state)");
    return (
      <div className="aspect-video bg-muted rounded-lg border flex items-center justify-center relative overflow-hidden">
        <Skeleton className="absolute inset-0 w-full h-full" />
        <Loader size={40} className="z-10" />
      </div>
    );
  }

  /* ============================================================
     PLAYER RENDER (with download prevention)
  ============================================================ */
  return (
    <div
      className="relative aspect-video rounded-lg border overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {sources.length > 0 && (
        <CustomPlayer
          key={lessonId}
          sources={sources}
          poster={thumbnailUrl}
          initialTime={resumeTime}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onLoadedMetadata={onLoadedMetadata}
          captionUrl={captionUrl}
          spriteMetadata={fullSpriteMetadata}
          className="w-full h-full"
          noDownload
          restrictSeeking={!isCompleted}
          initialMaxTime={restrictionTimeRef.current}
          onRestrictionUpdate={onRestrictionUpdate}
          seekTo={seekSignal?.time}
          seekKey={seekSignal?.key}
        />
      )}
      {/* Transparent overlay — blocks native browser video context menu on mobile */}
      <div className="absolute inset-0 z-1 pointer-events-none select-none" />
    </div>
  );
}
export function CourseContent({ lessonId, userId }: iAppProps) {
  const queryClient = useQueryClient();
  const [isPending] = useTransition();
  const { triggerConfetti } = useConfetti2();
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isMobileDescriptionOpen, setIsMobileDescriptionOpen] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(false);
  const [isAssessmentOpen, setIsAssessmentOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [seekSignal, setSeekSignal] = useState<{ time: number; key: number } | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent<{ time: number }>) => {
      setSeekSignal({ time: e.detail.time, key: Date.now() });
    };
    window.addEventListener("video-seek", handler as EventListener);
    return () => window.removeEventListener("video-seek", handler as EventListener);
  }, []);

  // ✅ Optimization: Instant Local + Background Version Check
  const cacheKey = `lesson_content_${lessonId}`;
  const cached = useMemo(
    () => chatCache.get<LessonContentData | LockedContentData>(cacheKey, userId),
    [cacheKey, userId],
  );

  const { data: lesson } = useQuery({
    queryKey: ["lesson_content", lessonId],
    queryFn: async () => {
      // Pass cached version for cheap server-side version check
      // If versions match, server returns "not-modified" (no DB hit)
      const clientVersion = cached?.version;
      const result = (await getLessonContent(lessonId, clientVersion)) as
        | { status: "not-modified"; version: string }
        | LockedContentData
        | { status: "error"; message: string }
        | (LessonContentData & { status?: never });

      if (result?.status === "not-modified" && cached) {
        chatCache.touch(cacheKey, userId);
        return cached.data;
      }

      if (result && "status" in result && result.status === "locked") {
        chatCache.set(cacheKey, result, userId, result.version, PERMANENT_TTL);
        return result;
      }

      if (result && (!("status" in result) || result.status !== "error") && "lesson" in result) {
        chatCache.set(cacheKey, result, userId, result.version, PERMANENT_TTL);
      }

      return result;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.timestamp,
    staleTime: 1800000, // 30 mins
    refetchOnWindowFocus: true,
    refetchOnMount: true, // ✅ Trigger version check in background if stale
  });

  const rawData = lesson as LessonContentData | LockedContentData | undefined;
  const lockedData =
    rawData && "status" in rawData && rawData.status === "locked"
      ? rawData
      : null;
  const lessonData = rawData && "lesson" in rawData ? rawData.lesson : undefined;

  const questions = useMemo(() => {
    return rawData && "questions" in rawData ? rawData.questions ?? EMPTY_ARRAY : EMPTY_ARRAY;
  }, [rawData]);

  // ✅ isLoadingMCQs state
  const [isLoadingMCQs, setIsLoadingMCQs] = useState(false);

  const quizPassed = lessonData?.lessonProgress?.some((p: LessonProgressData) => p.quizPassed);
  const isFreeCourse = lessonData?.Chapter?.Course?.isFree;

  // Auto-enroll in free course: immediately invalidate available_courses so it
  // refetches in the background while lesson data loads.
  useEffect(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key.startsWith("available_courses");
      }
    });
  }, [queryClient]);

  const [vttText, setVttText] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    const vttUrl = lessonData?.transcription?.vttUrl;
    if (vttUrl && !vttText) {
      fetch(vttUrl)
        .then((r) => r.text())
        .then(setVttText)
        .catch(() => {});
    }
  }, [lessonData?.transcription?.vttUrl, vttText]);

  const cachedEligibility = chatCache.get<boolean>(
    `assessment_eligible_${lessonId}`,
    userId,
  )?.data;

  // isCompleted: mark lesson done in sidebar/UI only after pass/DB confirm
  const isCompleted =
    quizPassed ||
    optimisticCompleted ||
    cachedEligibility ||
    lessonData?.lessonProgress?.some((p: LessonProgressData) => p.completed) ||
    ((lessonData?.duration ?? 0) > 0 &&
      (lessonData?.lessonProgress?.[0]?.restrictionTime || 0) >=
        (lessonData?.duration ?? 0) * 60 * 0.9); // 90% threshold
  // ✅ Seed assessment eligibility cache on mount/update if completed
  useEffect(() => {
    if (isCompleted) {
      chatCache.set(
        `assessment_eligible_${lessonId}`,
        true,
        userId,
        undefined,
        ONE_YEAR_TTL,
      );
    }
  }, [lessonId, isCompleted, userId]);

  const hasVideo = Boolean(lessonData?.videoKey);

  // ✅ onSubmit: opens the assessment modal
  const onSubmit = useCallback(async () => {
    if (!hasVideo) return;
    setIsLoadingMCQs(true);
    try {
      setIsAssessmentOpen(true);
    } catch (e) {
      console.error("[onSubmit] Error:", e);
    } finally {
      setIsLoadingMCQs(false);
    }
  }, [hasVideo]);

  if (!lessonData) {
    return <LessonContentSkeleton />;
  }

  if (lockedData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-6" />
          </div>
          <h2 className="text-2xl font-bold">Request Access</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {lockedData.message}
          </p>
          <Link
            href={`/courses/${lockedData.courseSlug}`}
            className={buttonVariants({ className: "mt-6 w-full" })}
          >
            Request Access
          </Link>
        </div>
      </div>
    );
  }

  if (!lessonData) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center opacity-40">
        Lesson Not Available
      </div>
    );
  }

  // Use the highest known restriction time (DB vs Local vs Cache)
  const localRestriction = parseFloat(
    secureStorage.getItem(`restriction-time-${lessonId}_${userId}`) || "0",
  );
  const cachedRestriction = chatCache.get<number>(
    `restriction_${lessonId}`,
    userId,
  )?.data;

  const restriction = Math.max(
    lessonData?.lessonProgress?.[0]?.restrictionTime ?? 0,
    lessonData?.lessonProgress?.[0]?.lastWatched ?? 0,
    localRestriction,
    cachedRestriction || 0,
  );

  // Use the most accurate duration available
  const cachedDuration = chatCache.get<number>(
    `duration_${lessonId}`,
    userId,
  )?.data;
  const localDuration = parseFloat(
    secureStorage.getItem(`duration-${lessonId}`) || "0",
  );
  const effectiveDuration =
    cachedDuration || localDuration || lessonData.duration || 0;

  // canStartAssessment: enabled if threshold reached OR already marked completed in DB
  const canStartAssessment =
    quizPassed ||
    optimisticCompleted ||
    cachedEligibility ||
    lessonData?.lessonProgress?.some((p: LessonProgressData) => p.completed) ||
    (effectiveDuration > 0 &&
      Math.round(restriction) >= Math.round(effectiveDuration * 0.9));

  console.log("[DEBUG] Assessment Eligibility:", {
    lessonId,
    quizPassed,
    optimisticCompleted,
    cachedEligibility,
    dbCompleted: lessonData?.lessonProgress?.some((p: LessonProgressData) => p.completed),
    restriction,
    effectiveDuration,
    threshold: effectiveDuration * 0.9,
    canStartAssessment,
    questionsCount: questions.length,
  });

  async function confirmUnlock() {
    if (isUnlocking) return;
    setIsUnlocking(true);
    setShowUnlockDialog(false);
    try {
      const maxTime = (effectiveDuration || 0) * 60 || 999999;
      const res = await updateVideoProgress(lessonId, 0, 0, maxTime);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      secureStorage.setItemTracked(`restriction-time-${lessonId}_${userId}`, maxTime.toString());
      chatCache.set(`restriction_${lessonId}`, maxTime, userId, undefined, 86400);
      queryClient.invalidateQueries({ queryKey: ["lesson_content", lessonId] });
      setOptimisticCompleted(true);
      toast.success("Full access unlocked! You can now seek freely.");
    } catch {
      toast.error("Failed to unlock. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <>
      <AlertDialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Full Access</AlertDialogTitle>
            <AlertDialogDescription>
              Demo lessons can be watched without admin approval. You can unlock seeking for this demo lesson with one click.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowUnlockDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmUnlock}
              className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:opacity-90 border-0"
            >
              Unlock Now
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative flex flex-col min-[1025px]:flex-row bg-background min-[1025px]:h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-[1025px]:pl-6 min-[1025px]:overflow-y-auto">
        {/* VIDEO */}
        <div className="order-1 min-[1025px]:order-1 w-full relative">
          <VideoPlayer
            thumbnailkey={lessonData.thumbnailKey ?? ""}
            videoKey={lessonData.videoKey ?? ""}
            lessonId={lessonData?.id ?? ""}
            userId={userId}
            initialTime={lessonData.lessonProgress?.[0]?.lastWatched ?? 0}
            spriteKey={lessonData.spriteKey}
            spriteCols={lessonData.spriteCols}
            spriteRows={lessonData.spriteRows}
            spriteInterval={lessonData.spriteInterval}
            spriteWidth={lessonData.spriteWidth}
            spriteHeight={lessonData.spriteHeight}
            lowResKey={lessonData.lowResKey}
            transcriptionUrl={lessonData.transcription?.vttUrl}
            isCompleted={isCompleted}
            setOptimisticCompleted={setOptimisticCompleted}
            initialRestrictionTime={
              lessonData.lessonProgress?.[0]?.restrictionTime ?? 0
            }
            durationInSec={effectiveDuration}
            slug={lessonData.Chapter?.Course?.slug ?? ""}
            seekSignal={seekSignal}
          />
        </div>

        {/* DESKTOP TITLE */}
        <div className="hidden min-[1025px]:block order-3 min-[1025px]:order-2 pt-6 min-[1025px]:pt-3 min-[1025px]:pb-4">
          <h1 className="text-2xl min-[1025px]:text-3xl font-bold tracking-tight text-foreground truncate">
            {lessonData.title}
          </h1>
        </div>

        {/* MOBILE HEADER */}
        <div className="min-[1025px]:hidden order-2 flex items-center justify-between py-4 bg-background">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center">
                  <Button
                    disabled={
                      isPending ||
                      isLoadingMCQs ||
                      !hasVideo ||
                      !canStartAssessment
                    }
                    onClick={onSubmit}
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-full px-5 h-9 font-bold text-xs uppercase tracking-tight shadow-[0_2px_10px_rgba(var(--primary),0.2)]"
                  >
                    {isLoadingMCQs ? (
                      <Loader size={16} />
                    ) : hasVideo ? (
                      <>
                        <CheckCircle className="size-4" />
                        {quizPassed ? "Retake Assessment" : "Start Assessment"}
                      </>
                    ) : (
                      "No Video"
                    )}
                  </Button>
                </div>
              </PopoverTrigger>
              {!canStartAssessment && (
                <PopoverContent
                  side="top"
                  className="bg-accent text-sm text-accent-foreground border-accent-foreground/10 ml-2 px-4 py-2 rounded-xl shadow-xl font-medium w-fit max-w-[280px]"
                >
                  Complete watching the lesson to give assessment
                </PopoverContent>
              )}
            </Popover>
            {isFreeCourse && !isCompleted && (
              <Button
                onClick={() => setShowUnlockDialog(true)}
                disabled={isUnlocking}
                className="gap-2 rounded-full px-4 h-8 text-[10px] font-bold uppercase tracking-tight bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:opacity-90 animate-shine shadow-lg shadow-purple-500/30 border-0"
              >
                {isUnlocking ? (
                  <Loader size={12} />
                ) : (
                  <Sparkles className="size-3" />
                )}
                Unlock
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-purple-400 rounded-full bg-purple-400/10 hover:bg-purple-400/20 hover:text-purple-300! relative"
              onClick={() => setIsChatOpen(true)}
            >
              <Bot className="size-5" />
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-background text-primary border border-primary px-1 rounded-sm leading-tight">NEW</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-amber-500 rounded-full bg-amber-500/10! hover:bg-amber-500/20! hover:text-amber-500!"
              onClick={() => setIsSupportOpen(true)}
            >
              <TriangleAlert className="size-5" />
            </Button>
            <Drawer
              open={isMobileDescriptionOpen}
              onOpenChange={setIsMobileDescriptionOpen}
            >
              <DrawerTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground rounded-full bg-muted transition-colors"
                >
                  <ChevronRight className="size-6 ml-0.5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh] bg-background">
                <div className="mx-auto w-full max-w-lg flex flex-col h-full overflow-hidden">
                  <DrawerTitle className="sr-only">
                    Lesson Description
                  </DrawerTitle>
                  <DrawerDescription className="sr-only">
                    Detailed description for the current lesson
                  </DrawerDescription>
                  <div
                    className="flex-1 overflow-y-auto px-6 pt-8 pb-12 overscroll-contain"
                    data-lenis-prevent
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <h3 className="text-xl font-bold mb-4">
                        {lessonData.title}
                      </h3>
                      {lessonData.description && (
                        <RenderDescription
                          json={JSON.parse(lessonData.description)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>

        {/* DESKTOP ACTION BAR */}
        <div className="hidden min-[1025px]:flex order-3 min-[1025px]:order-3 items-center justify-between gap-4 px-4 min-[1025px]:px-0 pt-6 min-[1025px]:pt-6 min-[1025px]:pb-0 min-[1025px]:border-t mb-0">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex items-center">
                  <Button
                    disabled={
                      isPending ||
                      isLoadingMCQs ||
                      !hasVideo ||
                      !canStartAssessment
                    }
                    onClick={onSubmit}
                    variant="outline"
                    className="gap-2 rounded-full px-6"
                  >
                    {isLoadingMCQs ? (
                      <Loader size={16} />
                    ) : hasVideo ? (
                      <>
                        <CheckCircle className="size-4" />
                        {quizPassed ? "Retake Assessment" : "Start Assessment"}
                      </>
                    ) : (
                      "No Video Available"
                    )}
                  </Button>
                </div>
              </PopoverTrigger>
              {!canStartAssessment && (
                <PopoverContent
                  side="top"
                  className="bg-accent text-accent-foreground border-accent-foreground/10 px-4 py-2 rounded-xl shadow-xl font-medium w-fit max-w-[280px]"
                >
                  Complete watching the lesson to give assessment
                </PopoverContent>
              )}
            </Popover>
            {isFreeCourse && !isCompleted && (
              <Button
                onClick={() => setShowUnlockDialog(true)}
                disabled={isUnlocking}
                className="gap-2 rounded-full px-5 h-9 text-xs font-bold uppercase tracking-tight bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white hover:opacity-90 animate-shine shadow-lg shadow-purple-500/30 border-0"
              >
                {isUnlocking ? (
                  <Loader size={14} />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Unlock Full Access
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-purple-400 rounded-full h-10 w-10 bg-purple-400/10 hover:bg-purple-400/20! hover:text-purple-300! shrink-0 relative"
              onClick={() => setIsChatOpen(true)}
            >
              <Bot className="size-5" />
              <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-background text-primary border border-primary px-1 rounded-sm leading-tight">NEW</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-amber-500 rounded-full h-10 w-10 bg-amber-500/10 hover:bg-amber-500/20! hover:text-amber-500! shrink-0"
              onClick={() => setIsSupportOpen(true)}
            >
              <TriangleAlert className="size-5" />
            </Button>
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

      {/* DESKTOP DESCRIPTION PANEL */}
      {lessonData.description && isDescriptionOpen && (
        <div className="absolute -bottom-1 left-6 right-0 h-[85vh] z-30 hidden min-[1025px]:flex flex-col border border-border shadow-2xl bg-background animate-in slide-in-from-bottom duration-500 overflow-hidden rounded-t-3xl">
          <div className="flex items-center justify-between p-5 border-b border-border shrink-0 bg-muted/30">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <IconFileText className="size-5 text-primary" />
              Description
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setIsDescriptionOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto p-6 overscroll-contain scrollbar-thin scrollbar-thumb-primary/10"
            data-lenis-prevent
          >
            <h3 className="text-base font-bold mb-4">{lessonData.title}</h3>
            <RenderDescription json={JSON.parse(lessonData.description!)} />
          </div>
        </div>
      )}

      {/* ASSESSMENT MODAL */}
      {questions.length > 0 && (
        <AssessmentModal
          isOpen={isAssessmentOpen}
          onClose={() => setIsAssessmentOpen(false)}
          questions={questions}
          lessonId={lessonData.id}
          slug={lessonData.Chapter?.Course?.slug ?? ""}
          initialPassed={quizPassed}
          onSuccess={() => {
            setOptimisticCompleted(true);
            triggerConfetti();
            // setIsAssessmentOpen(false); // DO NOT CLOSE - Switch to review mode handled by modal internally

            const slug = lessonData.Chapter?.Course?.slug ?? "";
            const cacheKeys = [
              `lesson_content_${lessonId}`,
              `course_sidebar_${slug}`,
              `user_dashboard_${userId}`,
              `lesson_mcqs_${lessonId}`,
              `user_enrolled_courses_${userId}`,
            ];

            cacheKeys.forEach((key) => chatCache.invalidate(key, userId));
            chatCache.setNeedsSync(userId);

            queryClient.invalidateQueries({
              queryKey: ["lesson_content", lessonId],
            });
            queryClient.invalidateQueries({
              queryKey: ["course_sidebar", slug],
            });
            queryClient.invalidateQueries({
              queryKey: ["user_dashboard", userId],
            });
            queryClient.invalidateQueries({
              queryKey: ["enrolled_courses", userId],
            });
          }}
        />
      )}

      <SupportTicketDialog
        open={isSupportOpen}
        onOpenChange={setIsSupportOpen}
        userId={userId}
        initialCategory="fault"
        initialTitle=""
        courseName={lessonData.Chapter?.Course?.title ?? ""}
        lessonName={lessonData.title}
      />

      <FloatingChat
        lessonId={lessonId}
        userId={userId}
        vttText={vttText || undefined}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        videoDuration={effectiveDuration || undefined}
        restrictionTime={restriction}
      />
    </div>
    </>
  );
}
