"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  Volume,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  ChevronLeft,
  ChevronRight,
  Captions,
  RotateCcw,
  RotateCw
} from "lucide-react";

// Silence Video.js deprecation warnings for beforeRequest (which we use for surgical URL rewriting)
if (typeof window !== "undefined") {
  const originalWarn = (videojs as any).log.warn;
  (videojs as any).log.warn = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("beforeRequest is deprecated")) return;
    originalWarn(...args);
  };
}

if (typeof window !== "undefined") {
  (videojs as any).Vhs.xhr.beforeRequest = (options: any) => {
    if (options.uri.includes("/api/video/key/")) {
      options.withCredentials = true;
      if (options.uri.includes("storage.dev") || options.uri.includes("amazonaws.com") || options.uri.includes(env.NEXT_PUBLIC_APP_DOMAIN)) {
        try {
          const url = new URL(options.uri);
          const newUri = `${window.location.origin}${url.pathname}`;
          console.log("VideoPlayer-Global: Redirecting key request to origin:", newUri);
          return { ...options, uri: newUri };
        } catch (e) {
          return options;
        }
      }
    }
    return options;
  };
}
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Loader from "@/components/ui/Loader";
import { toast } from "sonner";
import { env } from "@/lib/env";

export interface VideoSource {
  src: string;
  type: string;
}

export interface SpriteMetadata {
  url: string;
  lowResUrl?: string; // URL to the ultra-low-res grid
  cols: number;
  rows: number;
  interval: number;
  width: number;
  height: number;
  initialCues?: any[];
}

interface VideoPlayerProps {
  src?: string;
  sources?: VideoSource[];
  type?: string;
  poster?: string;
  className?: string;
  initialTime?: number;
  spriteMetadata?: SpriteMetadata;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  captionUrl?: string;
  /** Block browser download button and right-click context menu on the video */
  noDownload?: boolean;
}

export function VideoPlayer({
  src,
  sources,
  type = "application/x-mpegURL",
  poster,
  className,
  initialTime = 0,
  spriteMetadata,
  onTimeUpdate,
  onPlay,
  onEnded,
  onLoadedMetadata,
  captionUrl,
  noDownload = false,
}: VideoPlayerProps) {
  console.log('[DEBUG] VideoPlayer (Custom) render', { src: !!src, sources: sources?.length, captionUrl: !!captionUrl });
  const videoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showCenterControls, setShowCenterControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seekAnimation, setSeekAnimation] = useState<{ type: "forward" | "backward", amount: number } | null>(null);
  const seekAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volumeAnimation, setVolumeAnimation] = useState<{ level: number, visible: boolean }>({ level: 1, visible: false });
  const volumeAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bufferedRanges, setBufferedRanges] = useState<{ start: number, end: number }[]>([]);
  const seekbarRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const lastToggleTimeRef = useRef<number>(0);
  const pendingPlayRef = useRef<Promise<void> | null>(null);

  const [hasCaptions, setHasCaptions] = useState(!!captionUrl);

  // Initialize player only once, then update sources
  useEffect(() => {
    if (!videoRef.current) return;
    setError(null);

    const initPlayer = () => {
      if (!videoRef.current) return;

      console.log("VideoPlayer: Initializing stable player instance");

      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }

      videoRef.current.innerHTML = "";
      const videoElement = document.createElement("video");
      videoElement.className = "video-js vjs-big-play-centered vjs-fill";
      videoElement.setAttribute("playsinline", "true");
      videoElement.setAttribute("crossorigin", "anonymous");
      if (noDownload) {
        // Disable browser's native download button and Save-As menu
        videoElement.setAttribute("controlsList", "nodownload noremoteplayback");
        videoElement.setAttribute("disablePictureInPicture", "true");
        videoElement.oncontextmenu = (e) => e.preventDefault();
      }
      videoRef.current.appendChild(videoElement);

      const currentSources = sources || (src ? [{ src, type }] : []);

      const player = (playerRef.current = videojs(videoElement, {
        autoplay: false,
        controls: false,
        fill: true,
        responsive: true,
        html5: {
          vhs: {
            overrideNative: true,
            fastQualityChange: true,
            beforeRequest: (options: any) => {
              // Fix for relative key URLs in existing manifests:
              // If the request for a key is going to the storage domain, redirect it to our origin.
              if (options.uri.includes("/api/video/key/")) {
                options.withCredentials = true;

                // If the URL has been resolved against Tigris/S3 (e.g. via relative path in manifest),
                // or if it's pointing to production,
                // swap it back to our origin so the key delivery API can handle it.
                if (options.uri.includes("storage.dev") || options.uri.includes("amazonaws.com") || options.uri.includes(env.NEXT_PUBLIC_APP_DOMAIN)) {
                  try {
                    const url = new URL(options.uri);
                    const newUri = `${window.location.origin}${url.pathname}`;
                    console.log("VideoPlayer: Redirecting key request to origin:", newUri);
                    options.uri = newUri;
                  } catch (e) {
                    console.error("VideoPlayer: Failed to rewrite key URL", e);
                  }
                }
              }
              return options;
            },
            enableLowInitialPlaylist: true,
            smoothQualityChange: false,
            useDevicePixelRatio: true,
            experimentalExactSeeking: true,
            experimentalExactManifestTimings: true,
            handlePartialData: true,       // Start playback before full segment loads
            maxBufferLength: 30,           // Buffer only 30s ahead (faster seeks)
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false,
        },
        sources: currentSources,
        poster: poster,
        playbackRates: [0.5, 1, 1.5, 2],
        controlBar: false,
      }));

      player.on("play", () => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        onPlay?.();
      });
      player.on("pause", () => {
        setIsPlaying(false);
        isPlayingRef.current = false;
      });
      player.on("timeupdate", () => {
        // ✅ FIX: Don't sync state from player if the user is currently dragging the slider
        if (isSeekingRef.current) return;

        const time = player.currentTime();
        if (typeof time === "number" && !isNaN(time)) {
          // ✅ FIX: Round to match Slider precision (0.01) to reduce re-renders
          const rounded = Math.round(time * 100) / 100;
          setCurrentTime(prev => {
            if (prev === rounded) return prev;
            return rounded;
          });
          onTimeUpdate?.(time); // Original precision for parent tracking
        }
      });
      player.on("loadedmetadata", () => {
        const d = player.duration() || 0;
        setDuration(d);
        onLoadedMetadata?.(d);
        if (initialTime > 0) player.currentTime(initialTime);
      });
      player.on("durationchange", () => {
        const d = player.duration() || 0;
        if (d > 0) setDuration(d);
      });
      player.on("ended", () => onEnded?.());
      player.on("error", () => {
        const err = player.error();
        const errorMsg = err ? `Error ${err.code}: ${err.message}` : "An unknown error occurred";
        setError(errorMsg);
        setIsBuffering(false);
      });

      // Buffer/Loading States
      player.on("waiting", () => setIsBuffering(true));
      player.on("playing", () => setIsBuffering(false));
      player.on("canplay", () => setIsBuffering(false));
      player.on("seeking", () => setIsBuffering(true));
      player.on("seeked", () => setIsBuffering(false));

      // Tracks listener for manifest-embedded captions
      const trackList = player.textTracks();
      const updateCaptionsStatus = () => {
        let found = false;
        const tracks = trackList as any;
        for (let i = 0; i < tracks.length; i++) {
          if (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') {
            found = true;
            break;
          }
        }
        setHasCaptions(found);
      };

      trackList.on('addtrack', updateCaptionsStatus);
      trackList.on('removetrack', updateCaptionsStatus);
      const onTrackChange = () => {
         // Sync UI state if changed elsewhere
         let isAnyShowing = false;
         const tracks = trackList as any;
         for (let i = 0; i < tracks.length; i++) {
           if ((tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') && tracks[i].mode === 'showing') {
             isAnyShowing = true;
             break;
           }
         }
         setCaptionsEnabled(isAnyShowing);
      };
      trackList.on('change', onTrackChange);

      // Buffered Progress listener
      player.on("progress", () => {
        const buffered = player.buffered();
        if (!buffered) return;
        const ranges = [];
        for (let i = 0; i < buffered.length; i++) {
          ranges.push({ start: buffered.start(i), end: buffered.end(i) });
        }
        setBufferedRanges(ranges);
      });

      // (Removed in-initializer caption logic to move to reactive effect)

      const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      player.on("fullscreenchange", handleFullscreenChange);

      // Keyboard Shortcuts (J, K, L)
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!player || player.isDisposed()) return;

        // Ignore if user is typing in an input or textarea
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }

        switch (e.key.toLowerCase()) {
          case " ":
            e.preventDefault();
            if (player.paused()) player.play();
            else player.pause();
            break;
          case "k":
            e.preventDefault();
            if (player.paused()) player.play();
            else player.pause();
            break;
          case "j":
            e.preventDefault();
            player.currentTime(Math.max(0, (player.currentTime() || 0) - 10));
            triggerSeekAnimation("backward", 10);
            break;
          case "l":
            e.preventDefault();
            player.currentTime(Math.min(player.duration() || 0, (player.currentTime() || 0) + 10));
            triggerSeekAnimation("forward", 10);
            break;
          case "arrowleft":
            e.preventDefault();
            player.currentTime(Math.max(0, (player.currentTime() || 0) - 5));
            triggerSeekAnimation("backward", 5);
            break;
          case "arrowright":
            e.preventDefault();
            player.currentTime(Math.min(player.duration() || 0, (player.currentTime() || 0) + 5));
            triggerSeekAnimation("forward", 5);
            break;
          case "arrowup":
            e.preventDefault();
            const currentVolUp = player.volume() || 0;
            const newVolUp = Math.min(1, currentVolUp + 0.1);
            player.volume(newVolUp);
            setVolume(newVolUp);
            setIsMuted(newVolUp === 0);
            triggerVolumeAnimation(newVolUp);
            break;
          case "arrowdown":
            e.preventDefault();
            const currentVolDown = player.volume() || 0;
            const newVolDown = Math.max(0, currentVolDown - 0.1);
            player.volume(newVolDown);
            setVolume(newVolDown);
            setIsMuted(newVolDown === 0);
            triggerVolumeAnimation(newVolDown);
            break;
          case "f":
            e.preventDefault();
            if (!document.fullscreenElement) {
              containerRef.current?.requestFullscreen();
            } else {
              document.exitFullscreen();
            }
            break;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      
      player.on("dispose", () => {
        window.removeEventListener("keydown", handleKeyDown);
        trackList.off('addtrack', updateCaptionsStatus);
        trackList.off('removetrack', updateCaptionsStatus);
        trackList.off('change', onTrackChange);
      });
    };

    const frame = requestAnimationFrame(initPlayer);

    return () => {
      cancelAnimationFrame(frame);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Reactive Captions: Handle URL changes or late arrivals without reload
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !captionUrl) return;

    player.ready(() => {
      console.log("VideoPlayer: Adding sidecar caption track", captionUrl);

      // 1. Remove ONLY our previous sidecar tracks, not manifest ones
      const tracks = player.textTracks();
      for (let i = tracks.length - 1; i >= 0; i--) {
        const track = (tracks[i] as any);
        // Only remove if it matches our sidecar logic (usually via label or src if available)
        if (track.label === "Sidecar-English") {
          player.removeRemoteTextTrack(track);
        }
      }

      // 2. Add the new sidecar track
      player.addRemoteTextTrack({
        kind: "captions",
        src: captionUrl,
        srclang: "en",
        label: "Sidecar-English",
        default: captionsEnabled,
      }, false);

      setHasCaptions(true);
    });
  }, [captionUrl]);

  // Sync sources when they change after initialization
  useEffect(() => {
    if (playerRef.current) {
      const currentSources = sources || (src ? [{ src, type }] : []);
      playerRef.current.src(currentSources);
    }
  }, [sources, src, type]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const isMobile = window.innerWidth < 768;

      if (!isMobile) {
        // 1. Extreme bottom edge (leaving the player area): Hide everything
        if (relativeY > rect.height - 5) {
          setShowControls(false);
          setShowCenterControls(false);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          return;
        }

        // 2. Toolbar/Seekbar area: Keep toolbar visible but hide center Play/Pause overlay
        if (relativeY > rect.height - 60) {
          setShowControls(true);
          setShowCenterControls(false);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          return;
        }
      }
    }

    // 3. Main video area: show everything
    setShowControls(true);
    setShowCenterControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

    // 1s timeout for mobile, 3s for desktop
    const timeout = window.innerWidth < 768 ? 2000 : 1500;

    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
        setShowCenterControls(false);
      }
    }, timeout);
  };

  const triggerSeekAnimation = (type: "forward" | "backward", amount: number = 10) => {
    setSeekAnimation({ type, amount });
    if (seekAnimationTimeoutRef.current) clearTimeout(seekAnimationTimeoutRef.current);
    seekAnimationTimeoutRef.current = setTimeout(() => setSeekAnimation(null), 800);
  };

  const triggerVolumeAnimation = (level: number) => {
    setVolumeAnimation({ level, visible: true });
    if (volumeAnimationTimeoutRef.current) clearTimeout(volumeAnimationTimeoutRef.current);
    volumeAnimationTimeoutRef.current = setTimeout(() => {
      setVolumeAnimation(prev => ({ ...prev, visible: false }));
    }, 1000);
  };

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    setShowCenterControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        setShowControls(false);
        setShowCenterControls(false);
      }
    }, 2000);
  };

  const togglePlay = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    if (!playerRef.current) return;

    // Robust toggle logic using actual player state + debouncing
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 400) return;
    lastToggleTimeRef.current = now;

    const isCurrentlyPaused = playerRef.current.paused();

    if (isCurrentlyPaused) {
      setIsPlaying(true);
      isPlayingRef.current = true;
      const playPromise = playerRef.current.play() as Promise<void> | undefined;
      if (playPromise !== undefined) {
        pendingPlayRef.current = playPromise;
        playPromise
          .then(() => { pendingPlayRef.current = null; })
          .catch((err: Error) => {
            pendingPlayRef.current = null;
            if (err.name !== "AbortError") console.error("VideoPlayer play() error:", err);
            setIsPlaying(false);
            isPlayingRef.current = false;
          });
      }
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (pendingPlayRef.current) {
        pendingPlayRef.current
          .then(() => playerRef.current?.pause())
          .catch(() => { });
      } else {
        playerRef.current.pause();
      }
    }
  };

  const handleSeek = useCallback((value: number[]) => {
    if (!value || isNaN(value[0])) return;

    // Lock status and update UI state only for performance
    isSeekingRef.current = true;
    let time = Math.round(value[0] * 100) / 100;
    time = Math.max(0, Math.min(time, duration || 0));

    setCurrentTime(time);
  }, [duration]);

  const handleSeekCommit = useCallback((value: number[]) => {
    if (!playerRef.current || !value || isNaN(value[0])) {
      isSeekingRef.current = false;
      return;
    }

    let time = Math.round(value[0] * 100) / 100;
    time = Math.max(0, Math.min(time, duration || 0));

    // Optional: Only snap on commit to keep dragging smooth but final position precise
    if (spriteMetadata?.interval) {
      time = Math.floor(time / spriteMetadata.interval) * spriteMetadata.interval;
    }

    try {
      playerRef.current.currentTime(time);
      setCurrentTime(time);
    } finally {
      // Small delay before unlocking to prevent the next 'timeupdate' 
      // from snapping the UI back to the old position before the seek completes
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    }
  }, [duration, spriteMetadata?.interval]);

  const toggleMute = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    const muted = !isMuted;
    setIsMuted(muted);
    if (playerRef.current) playerRef.current.muted(muted);

    toast.success(muted ? "Audio muted" : "Audio unmuted", {
      duration: 1000,
      position: "top-center"
    });
  };

  const handleVolumeChange = useCallback((value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    if (playerRef.current) playerRef.current.volume(vol);
    setIsMuted(vol === 0);
  }, []);

  const handlePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    playerRef.current.playbackRate(rate);
  };

  const toggleCaptions = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    if (playerRef.current) {
      const tracks = playerRef.current.textTracks();
      const enabled = !captionsEnabled;

      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'captions' || tracks[i].kind === 'subtitles') {
          tracks[i].mode = enabled ? 'showing' : 'disabled';
        }
      }

      setCaptionsEnabled(enabled);
      toast.success(enabled ? "Captions enabled" : "Captions disabled", {
        duration: 1000,
        position: "top-center"
      });
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        // Lock to landscape on mobile
        if (typeof window !== "undefined" && (window.screen as any).orientation?.lock) {
          (window.screen as any).orientation.lock("landscape").catch(() => {
            console.log("Orientation lock not supported or failed");
          });
        }
      }).catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
      // Unlock orientation
      if (typeof window !== "undefined" && (window.screen as any).orientation?.unlock) {
        (window.screen as any).orientation.unlock();
      }
    }
  };

  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent scrolling while dragging (optional, but keeping it clean)
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // 1. Strict Target Isolation: Ignore ANY touch that lands on or near interactive controls
    const target = e.target as HTMLElement;
    const isInteractive = !!target.closest('button, [role="button"], .cursor-pointer, .Slider-root, [data-seekbar]');
    if (isInteractive) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapTimeRef.current < 300;
    lastTapTimeRef.current = now;

    if (isDoubleTap) {
      // Cancel the pending single-tap toggle
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }

      // Double tap: seek forward/backward based on touch position
      if (!playerRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const x = touch.clientX - rect.left;
      const mid = rect.width / 2;

      if (x < mid) {
        const newTime = Math.max(0, playerRef.current.currentTime() - 10);
        playerRef.current.currentTime(newTime);
        triggerSeekAnimation("backward", 10);
      } else {
        const newTime = Math.min(playerRef.current.duration(), playerRef.current.currentTime() + 10);
        playerRef.current.currentTime(newTime);
        triggerSeekAnimation("forward", 10);
      }
      resetControlsTimeout();
    } else {
      // Single tap: strictly toggle controls visibility
      singleTapTimeoutRef.current = setTimeout(() => {
        singleTapTimeoutRef.current = null;

        setShowControls(prev => {
          const newState = !prev;
          setShowCenterControls(newState);
          if (newState) {
            resetControlsTimeout();
          } else {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          }
          return newState;
        });
      }, 300);
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Desktop only — mobile is handled by handleTouchEnd for instant response
    const isMobile = window.innerWidth < 768;
    if (isMobile) return;

    togglePlay(e);
    resetControlsTimeout();
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number } | null>(null);

  const calculatePosition = (clientX: number) => {
    if (!seekbarRef.current || duration === 0) return null;
    const rect = seekbarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(Math.max(x / rect.width, 0), 1);
    const time = percent * duration;
    return { x, time };
  };


  const [vttCues, setVttCues] = useState<any[]>(spriteMetadata?.initialCues || []);


  // Sync initial cues if they arrive later
  useEffect(() => {
    if (spriteMetadata?.initialCues && spriteMetadata.initialCues.length > 0) {
      setVttCues(spriteMetadata.initialCues);
      preloadSpriteImages(spriteMetadata.initialCues, spriteMetadata.url);
    }
  }, [spriteMetadata?.initialCues]);

  // Preload sprite images/ranges so they're cached by browser
  const preloadSpriteImages = (cues: any[], vttUrl: string) => {
    if (cues.length === 0) return;

    // ✅ Preload Low-Res Grid First (Instant Placeholder)
    if (spriteMetadata?.lowResUrl) {
      const img = new Image();
      img.src = spriteMetadata.lowResUrl;
      console.log("VideoPlayer: Preloading low-res grid...");
    }

    const baseUrl = vttUrl.substring(0, vttUrl.lastIndexOf("/") + 1);

    // For Byte-Range consolidated sprites, we don't want to preload the WHOLE .bin
    // We only preload the FIRST stripe to give instant feedback
    const firstCue = cues[0];
    if (firstCue?.url?.includes("#range=")) {
      console.log("VideoPlayer: Byte-Range mode detected. Preloading first stripe...");
      // getSpritePosition will handle the specific range fetch
      return;
    }

    const uniqueImages = new Set<string>();
    cues.forEach(cue => {
      if (cue.url) {
        const imageUrl = cue.url.startsWith("http") ? cue.url : baseUrl + cue.url;
        uniqueImages.add(imageUrl);
      }
    });

    console.log(`VideoPlayer: Preloading ${uniqueImages.size} sprite images...`);
    uniqueImages.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  };

  // Fetch and parse VTT if spriteMetadata.url contains .vtt
  useEffect(() => {
    const isVTT = spriteMetadata?.url && (spriteMetadata.url.includes(".vtt") || spriteMetadata.url.includes("thumbnails"));

    if (!isVTT) {
      console.log("VideoPlayer: Not a VTT URL", spriteMetadata?.url);
      setVttCues([]);
      return;
    }

    // ✅ Check cache first (sessionStorage for this browser session)
    const cacheKey = `vtt-cache-${spriteMetadata.url}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        console.log("VideoPlayer: Using cached VTT data", parsedCache.length, "cues");
        setVttCues(parsedCache);

        // ✅ Preload sprite images from cache
        preloadSpriteImages(parsedCache, spriteMetadata.url);
        return;
      } catch (e) {
        console.warn("VideoPlayer: Cache parse failed, fetching fresh");
      }
    }


    console.log("VideoPlayer: Fetching VTT from", spriteMetadata.url);
    fetch(spriteMetadata.url)
      .then(res => {
        if (!res.ok) throw new Error(`VTT fetch failed: ${res.status}`);
        return res.text();
      })
      .then(text => {
        console.log("VideoPlayer: VTT Loaded, length:", text.length);
        const lines = text.split("\n");
        // ... (rest of parser)
        const parsedCues: any[] = [];
        let currentCue: any = {};

        // Simple VTT parser
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
        console.log("VideoPlayer: Parsed Cues:", parsedCues.length);
        setVttCues(parsedCues);

        // ✅ Cache for this session
        sessionStorage.setItem(cacheKey, JSON.stringify(parsedCues));

        // ✅ Preload all sprite images
        preloadSpriteImages(parsedCues, spriteMetadata.url);

      })
      .catch(err => {
        console.error("VideoPlayer: Error loading VTT:", err);
      });
  }, [spriteMetadata?.url]);


  const [rangeCache] = useState<Map<string, string>>(new Map());
  const fullBinaryRef = useRef<Blob | null>(null);
  const [, setVttUpdateTick] = useState(0);

  // Background Preload the Full Binary
  const preloadFullBinary = async (pureUrl: string) => {
    if (fullBinaryRef.current) return;
    try {
      console.log("VideoPlayer: Starting background preload for", pureUrl);
      const res = await fetch(pureUrl);
      const blob = await res.blob();
      fullBinaryRef.current = blob;
      console.log("VideoPlayer: Sprite binary preloaded (", Math.round(blob.size / 1024), "KB )");
      // No re-render needed immediately, it will be used on next hover
    } catch (err) {
      console.error("VideoPlayer: Background preload failed", err);
    }
  };

  // Fixed display width for preview (source res is 320x180)
  const [previewWidth, setPreviewWidth] = useState(240);
  useEffect(() => {
    setPreviewWidth(window.innerWidth < 640 ? 180 : 240);
  }, []);

  const getSpritePosition = (time: number) => {
    if (!spriteMetadata) return null;

    if (vttCues.length > 0) {
      const cue = vttCues.find(c => time >= c.startTime && time < c.endTime);
      if (!cue) return null;

      const baseUrl = spriteMetadata.url.substring(0, spriteMetadata.url.lastIndexOf("/") + 1);
      let imageUrl = cue.url.startsWith("http") ? cue.url : baseUrl + cue.url;

      if (imageUrl.includes("#range=")) {
        const [pureUrl, fragment] = imageUrl.split("#range=");
        const cacheKey = `${pureUrl}#${fragment}`;

        // 1. If we have the full binary, use it (Truly Instant)
        if (fullBinaryRef.current) {
          if (!rangeCache.has(cacheKey)) {
            const [start, end] = fragment.split("-").map(Number);
            const slice = fullBinaryRef.current.slice(start, end + 1);
            const blobUrl = URL.createObjectURL(slice);
            rangeCache.set(cacheKey, blobUrl);
          }
          imageUrl = rangeCache.get(cacheKey)!;
        }
        // 2. WHILE LOADING: Fallback to individual range fetch (Instant Feedback)
        else if (rangeCache.has(cacheKey)) {
          imageUrl = rangeCache.get(cacheKey)!;
        } else {
          if (!rangeCache.has(`pending-${cacheKey}`)) {
            rangeCache.set(`pending-${cacheKey}`, "true");
            preloadFullBinary(pureUrl); // Trigger full load in background

            const [start, end] = fragment.split("-").map(Number);
            fetch(pureUrl, { headers: { "Range": `bytes=${start}-${end}` } })
              .then(res => res.blob())
              .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                rangeCache.set(cacheKey, blobUrl);
                setVttUpdateTick(t => t + 1); // Trigger re-render to show frame
              })
              .catch(err => {
                console.error("Sprite range fetch failed:", err);
                rangeCache.delete(`pending-${cacheKey}`);
              });
          }
          return null;
        }
      }

      // Scale display: source is e.g. 320x180, display at PREVIEW_DISPLAY_WIDTH
      const scale = previewWidth / cue.w;

      // Accurate background size for the sprite sheet
      // We calculate based on the source size and the current display scale
      const sheetWidth = (spriteMetadata.cols || 10) * previewWidth;

      return {
        backgroundImage: `url(${imageUrl})`,
        backgroundPosition: `-${cue.x * scale}px -${cue.y * scale}px`,
        backgroundSize: `${sheetWidth}px auto`, // Allow height to auto-scale proportionately
        width: Math.round(cue.w * scale),
        height: Math.round(cue.h * scale),
        sourceWidth: cue.w,
        sourceHeight: cue.h,
        startTime: cue.startTime,
        isHighRes: true,
      };
    }

    // 3. Fallback to Low-Res Grid if High-Res is pending
    if (spriteMetadata?.lowResUrl) {
      // High-res interval is used for both
      const index = Math.floor(time / spriteMetadata.interval);

      // Low-res grid constants (matched with sprite-generator.ts)
      const lowCols = 25;

      const col = index % lowCols;
      const row = Math.floor(index / lowCols);

      // Match preview-generator.ts: low-res frames are 40x22
      const lowFrameW = 40;
      const lowFrameH = 22;

      // Scale the 40px frame to fill PREVIEW_DISPLAY_WIDTH
      const lowScale = previewWidth / lowFrameW;

      const totalFrames = Math.ceil(duration / (spriteMetadata.interval || 10));
      const lowRows = Math.ceil(totalFrames / lowCols);

      return {
        backgroundImage: `url(${spriteMetadata.lowResUrl})`,
        backgroundPosition: `-${col * previewWidth}px -${row * (lowFrameH * lowScale)}px`,
        backgroundSize: `${lowCols * previewWidth}px ${lowRows * (lowFrameH * lowScale)}px`,
        width: previewWidth,
        height: Math.round(lowFrameH * lowScale),
        isHighRes: false,
        startTime: index * spriteMetadata.interval,
      };
    }

    // Legacy Grid Logic (Ensure metadata exists)
    if (!spriteMetadata || !spriteMetadata.cols || !spriteMetadata.interval) {
      return null;
    }
    const index = Math.min(
      Math.floor(time / spriteMetadata.interval),
      spriteMetadata.cols * spriteMetadata.rows - 1
    );
    const col = index % spriteMetadata.cols;
    const row = Math.floor(index / spriteMetadata.cols);
    const scale = previewWidth / spriteMetadata.width;
    const displayW = Math.round(spriteMetadata.width * scale);
    const displayH = Math.round(spriteMetadata.height * scale);
    return {
      backgroundImage: `url(${spriteMetadata.url})`,
      backgroundPosition: `-${col * displayW}px -${row * displayH}px`,
      backgroundSize: `${spriteMetadata.cols * displayW}px ${spriteMetadata.rows * displayH}px`,
      width: displayW,
      height: displayH,
      startTime: index * spriteMetadata.interval,
    };
  };

  const handleSeekbarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pos = calculatePosition(e.clientX);
    if (pos) {
      setHoverPosition(pos);
    }
  };

  const handleSeekbarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const pos = calculatePosition(e.touches[0].clientX);
    if (pos) {
      setHoverPosition(pos);
    }
  };

  const handleSeekbarTouchEnd = () => {
    setHoverPosition(null);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group bg-black aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/5 isolate select-none touch-manipulation @container",
        isFullscreen ? "w-screen h-screen rounded-none" : "w-full",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => {
        if (spriteMetadata?.url) {
          const pureUrl = spriteMetadata.url.replace("thumbnails.vtt", "sprites.bin");
          preloadFullBinary(pureUrl);
        }
      }}
      onMouseLeave={() => {
        // ✅ User Request: "hide that pause play bitton > , when outise the video player"
        setShowControls(false);
        setShowCenterControls(false);
        setHoverPosition(null);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >

      <style dangerouslySetInnerHTML={{
        __html: `
  .video-js .vjs-tech { ... }
  .vjs-poster { ... }
  .vjs-loading-spinner { display: none !important; }
  ${currentTime > 0 ? `.video-js .vjs-poster { display: none !important; }` : ''}

  .video-js { container-type: size; }

  .video-js .vjs-text-track-display {
    position: absolute !important;
    bottom: 6% !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 92% !important;
    display: flex !important;
    justify-content: center !important;
    pointer-events: none !important;
  }

  .video-js .vjs-text-track-display div {
    background: transparent !important;
  }

  .video-js .vjs-text-track-cue > div {
    display: inline-block !important;
    max-width: 100% !important;
    font-size: clamp(14px, 3.5cqh, 32px) !important;
    padding: clamp(6px, 1cqh, 14px) clamp(12px, 2cqh, 28px) !important;
    background: rgba(0,0,0,0.80) !important;
    color: #fff !important;
    border-radius: clamp(6px, 1cqh, 12px) !important;
    line-height: 1.4 !important;
    text-align: center !important;
    white-space: pre-wrap !important;
  }

  @keyframes flash {
    0%, 100% { opacity: 0.2; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.1); }
  }
  .animate-flash {
    animation: flash 0.6s ease-in-out infinite;
  }
`}} />
      <div data-vjs-player ref={videoRef} className="absolute inset-0 w-full h-full bg-black z-0" />

      {/* Playback Toggle Layer (z-5)
          Captures background clicks for play/pause and mobile double-tap to seek.
          Positioned above video but below controls/animations. */}
      <div
        className="absolute inset-0 z-5 cursor-pointer"
        style={{ touchAction: 'manipulation' }}
        onClick={handleContainerClick}
        onTouchEnd={handleTouchEnd}
        aria-hidden="true"
      />





      {seekAnimation?.type && (
        <>
          {/* Full Screen Dark Overlay */}
          <div className="absolute inset-0 z-15 bg-black/50 animate-in fade-in duration-300 pointer-events-none" />

          <div
            className={cn(
              "absolute inset-y-0 z-20 w-1/3 flex items-center justify-center pointer-events-none ",
              seekAnimation.type === "forward" ? "right-0" : "left-0"
            )}
          >
            {/* Soft side glow */}
            <div
              className={cn(
                "absolute inset-0 opacity-60",
                seekAnimation.type === "forward"
                  ? "bg-linear-to-l from-primary/10 to-transparent rounded-l-[100%]"
                  : "bg-linear-to-r from-primary/10 to-transparent rounded-r-[100%]"
              )}
            />
            <div className="relative flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 animate-in fade-in zoom-in-95 duration-200">

              {/* Direction Chevrons */}
              <div className="flex items-center justify-center -space-x-3 sm:-space-x-4 md:-space-x-6">
                {[0, 1, 2].map((i) => {
                  const isForward = seekAnimation.type === "forward";
                  const Icon = isForward ? ChevronRight : ChevronLeft;
                  const visualIndex = isForward ? i : 2 - i;

                  return (
                    <Icon
                      key={i}
                      className={cn(
                        "size-8 sm:size-10 md:size-13 lg:size-15 text-primary animate-in fade-in duration-300",
                        isForward
                          ? "slide-in-from-left-2"
                          : "slide-in-from-right-2"
                      )}
                      style={{
                        animationDelay: `${visualIndex * 60}ms`,
                        opacity: 0.3 + visualIndex * 0.35,
                        filter: `blur(${visualIndex === 2
                            ? 0
                            : visualIndex === 1
                              ? 0.4
                              : 0.8
                          }px)`
                      }}
                    />
                  );
                })}
              </div>

              {/* Time Label */}
              <span className="text-white font-black text-base sm:text-lg md:text-2xl tracking-tight tabular-nums animate-in fade-in duration-300 delay-150 -mt-1">
                {seekAnimation.type === "forward" ? "+" : "-"}
                {seekAnimation.amount}s
              </span>

            </div>

          </div>
        </>
      )}

      {/* Centered Volume Indicator */}
      {volumeAnimation.visible && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 rounded-2xl flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-200 border border-white/10">
            {(() => {
              const lv = volumeAnimation.level;
              if (lv === 0) return <VolumeX className="size-8 text-primary fill-white" />;
              if (lv <= 0.33) return <Volume className="size-8 text-primary fill-white" />;
              if (lv <= 0.66) return <Volume1 className="size-8 text-primary fill-white" />;
              return <Volume2 className="size-8 text-primary fill-white" />;
            })()}
            <span className="text-primary font-black text-2xl tabular-nums">
              {Math.round(volumeAnimation.level * 100)}%
            </span>
          </div>
        </div>
      )}



      {/* Primary Custom Buffer Loader */}
      {isBuffering && !error && (
        <div className="absolute inset-0 z-45 flex items-center justify-center pointer-events-none">
          <Loader size={48} />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center animate-in fade-in duration-300 rounded-lg">
          <div className="bg-destructive/20 border border-destructive/50 p-4 rounded-lg max-w-sm">
            <h3 className="text-destructive font-bold mb-2">Playback Error</h3>
            <p className="text-sm text-white/70 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-md text-sm transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 z-40 flex flex-col justify-end transition-opacity duration-300 bg-linear-to-t from-black/90 via-transparent to-transparent pointer-events-none",
          showControls && !error ? "opacity-100" : "opacity-0"
        )}
      >
        <div
          className="space-y-2 sm:space-y-3 pb-3 sm:pb-4 px-2 sm:px-4 pointer-events-auto"
          onMouseLeave={() => setHoverPosition(null)}
        >
          <div
            data-seekbar
            className="relative group/seekbar touch-none cursor-pointer py-3 -my-3"
            ref={seekbarRef}
            onMouseMove={(e) => {
              handleSeekbarMouseMove(e);
            }}
            onMouseLeave={(e) => {
              setHoverPosition(null);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const pos = calculatePosition(e.clientX);
              if (pos) {
                const spritePos = spriteMetadata ? getSpritePosition(pos.time) : null;
                const snapTime = spritePos?.startTime ?? pos.time;
                handleSeekCommit([snapTime]);
              }
            }}
            onTouchMove={handleSeekbarTouchMove}
            onTouchEnd={handleSeekbarTouchEnd}
          >
            {hoverPosition && (() => {
              const spritePos = spriteMetadata ? getSpritePosition(hoverPosition.time) : null;
              const snapTime = spritePos?.startTime ?? hoverPosition.time;

              return (
                <div
                  className="absolute bottom-full mb-1 sm:mb-1.5 -translate-x-1/2 flex flex-col items-center animate-in fade-in zoom-in duration-150 pointer-events-none z-50"
                  style={{ left: `${(snapTime / duration) * 100}%` }}
                >
                  {spriteMetadata ? (
                    spritePos ? (
                      <div className="bg-black/95 border border-white/20 rounded-lg overflow-hidden p-0.5 shadow-2xl backdrop-blur-md origin-bottom scale-[0.5] sm:scale-[0.7] md:scale-[0.9] transition-transform duration-200">
                        <div className="relative rounded-md overflow-hidden bg-muted flex items-center justify-center" style={{ width: `${spritePos.width}px`, height: `${spritePos.height}px` }}>
                          {/* Low Res Layer (visible while loading HD or as base) */}
                          {(!spritePos.isHighRes || true) && (
                            <div
                              className={cn(
                                "absolute inset-0 transition-opacity duration-300",
                                spritePos.isHighRes ? "opacity-0" : "opacity-100 blur-[2px] scale-105"
                              )}
                              style={{
                                width: `${spritePos.width}px`,
                                height: `${spritePos.height}px`,
                                backgroundImage: spritePos.backgroundImage,
                                backgroundPosition: spritePos.backgroundPosition,
                                backgroundSize: spritePos.backgroundSize,
                                backgroundRepeat: 'no-repeat',
                                imageRendering: 'crisp-edges' as any,
                              }}
                            />
                          )}

                          {/* High Res Layer */}
                          <div
                            className={cn(
                              "transition-opacity duration-300",
                              spritePos.isHighRes ? "opacity-100" : "opacity-0"
                            )}
                            style={{
                              width: `${spritePos.width}px`,
                              height: `${spritePos.height}px`,
                              backgroundImage: spritePos.backgroundImage,
                              backgroundPosition: spritePos.backgroundPosition,
                              backgroundSize: spritePos.backgroundSize,
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'auto',
                            }}
                          />

                          <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono text-white/90">
                            {formatTime(snapTime)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-black/95 border border-white/20 rounded-lg overflow-hidden p-0.5 shadow-2xl backdrop-blur-md flex items-center justify-center w-32 aspect-video">
                        <Loader size={16} />
                      </div>
                    )
                  ) : (
                    <div className="bg-black/90 border border-white/20 rounded-lg px-3 py-2 shadow-2xl backdrop-blur-md">
                      <div className="text-sm font-mono text-white/90">
                        {formatTime(hoverPosition.time)}
                      </div>
                    </div>
                  )}
                  <div className="w-2.5 h-2.5 bg-black/95 rotate-45 border-r border-b border-white/20 -mt-1.5 -z-1" />
                </div>
              );
            })()}

            {/* Base Track (since we'll make Slider track transparent) */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/10 rounded-full pointer-events-none" />

            {/* Buffer Overlay Bar */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 pointer-events-none px-px">
              {bufferedRanges.map((range, idx) => (
                <div
                  key={idx}
                  className="absolute h-full bg-white/20 rounded-full transition-all duration-300"
                  style={{
                    left: `${(range.start / (duration || 1)) * 100}%`,
                    width: `${((range.end - range.start) / (duration || 1)) * 100}%`
                  }}
                />
              ))}
            </div>

            <Slider
              value={[Math.round(currentTime * 100) / 100]}
              max={duration || 100}
              step={0.01}
              onValueChange={handleSeek}
              onValueCommit={handleSeekCommit}
              className="cursor-pointer h-1.5 relative z-10"
              onTouchEnd={(e) => e.stopPropagation()}
            />
          </div>

          <div className="flex items-center justify-between mt-1 sm:mt-2">
            <div className="flex items-center gap-2 sm:gap-4 text-white">
              <button
                type="button"
                onClick={(e) => { togglePlay(e); resetControlsTimeout(); }}
                onTouchEnd={(e) => { e.stopPropagation(); togglePlay(e); resetControlsTimeout(); }}
                className="hover:text-primary transition-colors focus:outline-none p-1 sm:p-0"
              >
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
              </button>

              <div className="flex items-center gap-1 sm:gap-2 group/volume">
                <button type="button" onClick={toggleMute} className="hover:text-primary focus:outline-none p-1 sm:p-0">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>
                <div className="w-0 sm:group-hover/volume:w-20 transition-all duration-300 overflow-hidden hidden sm:block">
                  <Slider
                    value={[Math.round((isMuted ? 0 : volume) * 100) / 100]}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="w-20 cursor-pointer"
                    onTouchEnd={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              <div className="text-[11px] sm:text-[13px] font-medium text-white/90 tabular-nums">
                {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 text-white">
              {(hasCaptions || captionUrl) && (
                <button
                  type="button"
                  onClick={toggleCaptions}
                  className={cn(
                    "hover:text-primary focus:outline-none transition-all duration-200 p-1 sm:p-0",
                    captionsEnabled ? "text-primary scale-110" : "text-white/70"
                  )}
                  title="Toggle Captions"
                >
                  <Captions className="w-5 h-5" />
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-bold hover:text-primary transition-colors focus:outline-none bg-white/10 hover:bg-white/20 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-white/10">
                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {playbackRate}x
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={26}
                  container={isFullscreen ? containerRef.current ?? undefined : undefined}
                  avoidCollisions={false}
                  className={`bg-black/95 border-white/20 text-white
                             w-[clamp(100px,12cqw,120px)]
                             backdrop-blur-3xl p-1.5
                             shadow-2xl animate-in fade-in
                             duration-200
                             z-9999
                             rounded-xl border`}>
                  <div className="px-2 py-1 text-[9px] font-bold text-white/40 uppercase tracking-widest border-b border-white/5 mb-1">
                    Speed
                  </div>
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <DropdownMenuItem
                      key={rate}
                      onClick={() => handlePlaybackRate(rate)}
                      className={cn(
                        "cursor-pointer focus:bg-primary/20 focus:text-primary text-[11px] font-medium px-2 py-1.5 rounded-md transition-colors",
                        playbackRate === rate && "bg-primary/20 text-primary font-bold"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{rate === 1 ? "Normal" : `${rate}x`}</span>
                        {playbackRate === rate && <div className="w-1 h-1 rounded-full bg-primary" />}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button type="button" onClick={toggleFullscreen} className="hover:text-primary focus:outline-none transition-colors p-1 sm:p-0">
                {isFullscreen ? <Minimize className="w-5 h-5 sm:w-6 sm:h-6" /> : <Maximize className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {(showCenterControls && !isBuffering && !seekAnimation && !volumeAnimation.visible && !hoverPosition) && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none gap-[8%] bg-black/50 animate-in fade-in duration-300">
          {/* Backward 10s */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!playerRef.current) return;
              const newTime = Math.max(0, playerRef.current.currentTime() - 10);
              playerRef.current.currentTime(newTime);
              triggerSeekAnimation("backward", 10);
              resetControlsTimeout();
            }}
            className="
              flex flex-col items-center justify-center gap-1
              text-primary/70 duration-100 hover:scale-105
              pointer-events-auto cursor-pointer
              animate-in fade-in slide-in-from-right-4
            "
          >
            <div className="relative flex items-center justify-center overflow-visible">
              <RotateCcw className="size-6 sm:size-8 md:size-[clamp(32px,8cqw,64px)]" />
              <span className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 text-white/90 text-[9px] sm:text-[11px] md:text-[clamp(9px,1.8cqw,13px)] font-black leading-none">10</span>
            </div>
          </button>

          {/* Centered Play/Pause */}
          <div
            onClick={(e) => { togglePlay(e); resetControlsTimeout(); }}
            className="
              size-12 sm:size-16 md:size-[clamp(64px,12cqw,84px)]
              flex items-center justify-center
              rounded-full 
              bg-primary/20
              border-2 border-primary/50
              text-primary
              shadow-[0_0_30px_rgba(var(--primary),0.3)]
              transition-all duration-300
              hover:scale-105 hover:bg-primary/20 hover:border-primary
              pointer-events-auto
              cursor-pointer
              animate-in fade-in zoom-in
            "
          >
            {isPlaying ? (
              <Pause className="size-[45%] fill-white" />
            ) : (
              <Play className="size-[45%] fill-white ml-[5%]" />
            )}
          </div>

          {/* Forward 10s */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!playerRef.current) return;
              const newTime = Math.min(playerRef.current.duration(), playerRef.current.currentTime() + 10);
              playerRef.current.currentTime(newTime);
              triggerSeekAnimation("forward", 10);
              resetControlsTimeout();
            }}
            className="
              flex flex-col items-center justify-center gap-1
              text-primary/70 duration-100 hover:scale-105
              pointer-events-auto cursor-pointer
              animate-in fade-in slide-in-from-left-4
            "
          >
            <div className="relative flex items-center justify-center overflow-visible">
              <RotateCw className="size-6 sm:size-8 md:size-[clamp(32px,8cqw,64px)]" />
              <span className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 text-white/90 text-[9px] sm:text-[11px] md:text-[clamp(9px,1.8cqw,13px)] font-black leading-none">10</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
