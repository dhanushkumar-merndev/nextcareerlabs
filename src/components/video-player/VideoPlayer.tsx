"use client";

import React, { useEffect, useRef, useState } from "react";
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
  Captions
} from "lucide-react";
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
}: VideoPlayerProps) {
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
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [seekAnimation, setSeekAnimation] = useState<{ type: "forward" | "backward", amount: number } | null>(null);
  const seekAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [volumeAnimation, setVolumeAnimation] = useState<{ level: number, visible: boolean }>({ level: 1, visible: false });
  const volumeAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
  const pendingPlayRef = useRef<Promise<void> | null>(null);

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
        onPlay?.();
      });
      player.on("pause", () => setIsPlaying(false));
      player.on("timeupdate", () => {
        const time = player.currentTime() || 0;
        setCurrentTime(time);
        onTimeUpdate?.(time);
      });
      player.on("loadedmetadata", () => {
        const duration = player.duration() || 0;
        setDuration(duration);
        onLoadedMetadata?.(duration);
        if (initialTime > 0) player.currentTime(initialTime);
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
          case "spacebar":
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
      player.on("dispose", () => window.removeEventListener("keydown", handleKeyDown));
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

    let cancelled = false;

    // Validate URL returns a real WebVTT file before adding to player
    const validateAndAdd = async () => {
      try {
        const res = await fetch(captionUrl, { method: "GET", headers: { Range: "bytes=0-20" } });
        if (!res.ok) {
          console.log("VideoPlayer: Caption URL returned", res.status, "— skipping");
          return;
        }
        const text = await res.text();
        if (!text.trimStart().startsWith("WEBVTT")) {
          console.log("VideoPlayer: Caption URL is not valid WebVTT — skipping");
          return;
        }
      } catch (err) {
        console.log("VideoPlayer: Caption URL unreachable — skipping", err);
        return;
      }

      if (cancelled) return;

      player.ready(() => {
        if (cancelled) return;
        console.log("VideoPlayer: Updating caption track", captionUrl);
        
        // 1. Remove any existing caption/subtitle tracks to allow hot-swapping
        const tracks = player.textTracks();
        for (let i = tracks.length - 1; i >= 0; i--) {
          const track = tracks[i];
          if (track.kind === "captions" || track.kind === "subtitles") {
            player.removeRemoteTextTrack(track);
          }
        }

        // 2. Add the new track
        player.addRemoteTextTrack({
          kind: "captions",
          src: captionUrl,
          srclang: "en",
          label: "English",
          default: captionsEnabled,
        }, false);

        // 3. Sync track mode with UI state after a short delay
        setTimeout(() => {
          const newTracks = player.textTracks();
          for (let i = 0; i < newTracks.length; i++) {
            const t = newTracks[i];
            if (t.kind === "captions" || t.kind === "subtitles") {
              t.mode = captionsEnabled ? "showing" : "disabled";
            }
          }
        }, 100);
      });
    };

    validateAndAdd();

    return () => { cancelled = true; };
  }, [captionUrl, playerRef.current, sources, src]);

  // Sync sources when they change after initialization
  useEffect(() => {
    if (playerRef.current) {
      const currentSources = sources || (src ? [{ src, type }] : []);
      playerRef.current.src(currentSources);
    }
  }, [sources, src, type]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
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


  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerRef.current) return;

    if (playerRef.current.paused()) {
      // Chain pause onto the play Promise to avoid AbortError
      const playPromise = playerRef.current.play() as Promise<void> | undefined;
      if (playPromise !== undefined) {
        pendingPlayRef.current = playPromise;
        playPromise
          .then(() => {
            pendingPlayRef.current = null;
          })
          .catch((err: Error) => {
            pendingPlayRef.current = null;
            if (err.name !== "AbortError") {
              console.error("VideoPlayer play() error:", err);
            }
          });
      }
    } else {
      if (pendingPlayRef.current) {
        // play() is still resolving — pause after it settles
        pendingPlayRef.current
          .then(() => playerRef.current?.pause())
          .catch(() => {});
      } else {
        playerRef.current.pause();
      }
    }
  };

  const handleSeek = (value: number[]) => {
    let time = value[0];
    
    // Snap to sprite interval if available for better HLS performance and preview matching
    if (spriteMetadata?.interval) {
        time = Math.floor(time / spriteMetadata.interval) * spriteMetadata.interval;
    }
    
    playerRef.current.currentTime(time);
    setCurrentTime(time);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = !isMuted;
    setIsMuted(muted);
    playerRef.current.muted(muted);
    
    toast.success(muted ? "Audio muted" : "Audio unmuted", {
      duration: 1000,
      position: "top-center"
    });
  };

  const handleVolumeChange = (value: number[]) => {
    const vol = value[0];
    setVolume(vol);
    playerRef.current.volume(vol);
    setIsMuted(vol === 0);
  };

  const handlePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    playerRef.current.playbackRate(rate);
  };

  const toggleCaptions = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const lastTapTimeRef = useRef<number>(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    // Mobile touch start
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent scrolling while dragging (optional, but keeping it clean)
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = () => {
    // Mobile touch end
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only handle double tap on mobile for seeking
    const now = Date.now();
    const isDoubleTap = now - lastTapTimeRef.current < 300;
    lastTapTimeRef.current = now;

    if (isDoubleTap && window.innerWidth < 768) {
      if (!containerRef.current || !playerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const mid = rect.width / 2;

      if (x < mid) {
        // Rewind
        const newTime = Math.max(0, playerRef.current.currentTime() - 10);
        playerRef.current.currentTime(newTime);
        triggerSeekAnimation("backward", 10);
      } else {
        // Forward
        const newTime = Math.min(playerRef.current.duration(), playerRef.current.currentTime() + 10);
        playerRef.current.currentTime(newTime);
        triggerSeekAnimation("forward", 10);
      }
      return;
    }

    togglePlay(e);
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
  const [vttLoading, setVttLoading] = useState(false);

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

    // Not cached, fetch it
    setVttLoading(true);
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
        setVttLoading(false);
      })
      .catch(err => {
        console.error("VideoPlayer: Error loading VTT:", err);
        setVttLoading(false);
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
  const PREVIEW_DISPLAY_WIDTH = typeof window !== 'undefined' && window.innerWidth < 640 ? 180 : 240;

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
        const scale = PREVIEW_DISPLAY_WIDTH / cue.w;
        
        // Accurate background size for the sprite sheet
        // We calculate based on the source size and the current display scale
        const sheetWidth = (spriteMetadata.cols || 10) * PREVIEW_DISPLAY_WIDTH;

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
        const lowWidth = 40;
        const lowHeight = 22;
        const lowCols = 25;
        
        const col = index % lowCols;
        const row = Math.floor(index / lowCols);
        
        // Match preview-generator.ts: low-res frames are 40x22
        const lowFrameW = 40;
        const lowFrameH = 22;
        
        // Scale the 40px frame to fill PREVIEW_DISPLAY_WIDTH
        const lowScale = PREVIEW_DISPLAY_WIDTH / lowFrameW;
        
        const totalFrames = Math.ceil(duration / (spriteMetadata.interval || 10));
        const lowRows = Math.ceil(totalFrames / lowCols);

        return {
            backgroundImage: `url(${spriteMetadata.lowResUrl})`,
            backgroundPosition: `-${col * PREVIEW_DISPLAY_WIDTH}px -${row * (lowFrameH * lowScale)}px`,
            backgroundSize: `${lowCols * PREVIEW_DISPLAY_WIDTH}px ${lowRows * (lowFrameH * lowScale)}px`,
            width: PREVIEW_DISPLAY_WIDTH, 
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
    const scale = PREVIEW_DISPLAY_WIDTH / spriteMetadata.width;
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
        "relative group w-full h-full bg-black shadow-2xl overflow-hidden",
        isFullscreen ? "fixed inset-0 z-9999 rounded-none" : "md:rounded-lg md:border md:border-white/10 rounded-none border-none",
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
        if (isPlaying) setShowControls(false);
        setHoverPosition(null);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleContainerClick}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .video-js .vjs-tech {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          opacity: 1 !important;
          visibility: visible !important;
          object-fit: contain !important;
        }
        .vjs-poster {
          background-size: cover !important;
          background-position: center !important;
        }
        .vjs-poster img {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
        .vjs-loading-spinner {
          display: none !important;
        }
        ${currentTime > 0 ? `
          .video-js .vjs-poster {
            display: none !important;
          }
        ` : ''}
      `}} />

      <div data-vjs-player ref={videoRef} className="absolute inset-0 w-full h-full bg-black" />

    <style
  dangerouslySetInnerHTML={{
    __html: `
.video-js {
  container-type: size;
}

/* Bottom center wrapper */
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

/* Remove defaults */
.video-js .vjs-text-track-display div {
  background: transparent !important;
}

/* Caption text */
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
`,
  }}
/>



{seekAnimation?.type && (
  <div
    className={cn(
      "absolute inset-y-0 z-20 w-1/3 flex items-center justify-center pointer-events-none",
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

    <div className="relative flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-200">

      {/* Direction Chevrons */}
<div className="flex items-center -space-x-3">
  {[0, 1, 2].map((i) => {
    const isForward = seekAnimation.type === "forward";
    const Icon = isForward ? ChevronRight : ChevronLeft;

    // Reverse index for backward
    const visualIndex = isForward ? i : 2 - i;

    return (
      <Icon
        key={i}
        className={cn(
          "size-10 text-primary animate-in fade-in duration-300",
          isForward
            ? "slide-in-from-left-2"
            : "slide-in-from-right-2"
        )}
        style={{
          animationDelay: `${visualIndex * 80}ms`,
          opacity: 0.4 + visualIndex * 0.3,
          filter: `blur(${
            visualIndex === 2
              ? 0
              : visualIndex === 1
              ? 0.3
              : 0.6
          }px)`
        }}
      />
    );
  })}
</div>



      {/* Time Label */}
      <span className="text-primary font-bold text-sm tracking-wide tabular-nums animate-in fade-in duration-300 delay-200">
        {seekAnimation.type === "forward" ? "+" : "-"}
        {seekAnimation.amount}s
      </span>

    </div>
  </div>
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

{/* Mobile Vertical Volume Bar (Right Side) Removed */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes flash {
          0%, 100% { opacity: 0.2; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .animate-flash {
          animation: flash 0.6s ease-in-out infinite;
        }
      `}} />

      {/* Primary Custom Buffer Loader */}
      {isBuffering && !error && (
        <div className="absolute inset-0 z-45 flex items-center justify-center">
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
          "absolute inset-0 z-10 flex flex-col justify-end transition-opacity duration-300 bg-linear-to-t from-black/90 via-transparent to-transparent",
          showControls && !error ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div 
          className="space-y-2 sm:space-y-3 pb-3 sm:pb-4 px-2 sm:px-4"
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setHoverPosition(null)}
        >
          <div 
            className="relative group/seekbar touch-none cursor-pointer"
            style={{ padding: "10px 0", margin: "-10px 0" }}
            onMouseMove={(e) => {
              e.stopPropagation();
              handleSeekbarMouseMove(e);
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              setHoverPosition(null);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              // Expand hit area: allow clicking near the line to seek
              const pos = calculatePosition(e.clientX);
              if (pos) {
                // Snap to sprite timestamp to match the preview exactly
                const spritePos = spriteMetadata ? getSpritePosition(pos.time) : null;
                const snapTime = spritePos?.startTime ?? pos.time;
                handleSeek([snapTime]);
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchMove={handleSeekbarTouchMove}
            onTouchEnd={handleSeekbarTouchEnd}
            onClick={(e) => {
              e.stopPropagation();
            }}
            ref={seekbarRef}
          >
            {hoverPosition && (() => {
                const spritePos = spriteMetadata ? getSpritePosition(hoverPosition.time) : null;
                const snapTime = spritePos?.startTime ?? hoverPosition.time;
                
                return (
                  <div 
                    className="absolute bottom-full mb-3 -translate-x-1/2 flex flex-col items-center animate-in fade-in zoom-in duration-150 pointer-events-none"
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
            
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.01}
              onValueChange={handleSeek}
              className="cursor-pointer h-1.5 flex items-center "
            />
          </div>

          <div className="flex items-center justify-between mt-1 sm:mt-2">
            <div className="flex items-center gap-2 sm:gap-4 text-white">
              <button 
                type="button"
                onClick={togglePlay}
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
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="w-20 cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-[11px] sm:text-[13px] font-medium text-white/90 tabular-nums">
                {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 text-white">
              {captionUrl && (
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
                  <button type="button" className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-bold hover:text-primary transition-colors focus:outline-none bg-white/10 hover:bg-white/20 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-white/10">
                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {playbackRate}x
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  side="top"
                  align="end"
                  sideOffset={12}
                  avoidCollisions
                  container={containerRef.current}
                  className="bg-black/95 border-white/20 text-white w-28 sm:w-32 backdrop-blur-2xl p-1 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-10001"
                >
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

      {(!isPlaying && !isBuffering && !seekAnimation && !volumeAnimation.visible) && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none group/playbtn">
          <div 
            onClick={togglePlay}
            className="
              w-12 h-12 sm:w-16 sm:h-16
              flex items-center justify-center
              rounded-full 
              backdrop-blur-md 
              bg-primary/20
              border-2 border-primary/50
              text-primary
              shadow-[0_0_30px_rgba(var(--primary),0.3)]
              transition-all duration-300
              hover:scale-110 hover:bg-primary/20 hover:border-primary
              pointer-events-auto
              cursor-pointer
            "
          >
            <Play className="w-6 h-6 sm:w-8 sm:h-8 fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}
