"use client";

import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Settings 
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface VideoSource {
  src: string;
  type: string;
}

interface VideoPlayerProps {
  src?: string;
  sources?: VideoSource[];
  type?: string;
  poster?: string;
  className?: string;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoadedMetadata?: (duration: number) => void;
}

export function VideoPlayer({
  src,
  sources,
  type = "application/x-mpegURL",
  poster,
  className,
  initialTime = 0,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onLoadedMetadata,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekbarRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewSeekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  // Initialize player only once, then update sources
  useEffect(() => {
    if (!videoRef.current) return;
    setError(null);

    // Use requestAnimationFrame to ensure DOM mounting is stable
    const initPlayer = () => {
      if (!videoRef.current) return;
      
      console.log("VideoPlayer: Initializing stable player instance after DOM-ready");

      // CLEANUP: Dispose any zombie player instance
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      
      // CRITICAL: Clear container and create FRESH video element
      // This prevents React from losing track of the DOM node
      videoRef.current.innerHTML = "";
      const videoElement = document.createElement("video");
      videoElement.className = "video-js vjs-big-play-centered vjs-fill";
      videoElement.setAttribute("playsinline", "true");
      videoElement.setAttribute("crossorigin", "anonymous"); 
      videoRef.current.appendChild(videoElement);

      // Prepare sources
      const currentSources = sources || (src ? [{ src, type }] : []);
      
      const player = (playerRef.current = videojs(videoElement, {
        autoplay: false,
        controls: false,
        fill: true,
        responsive: true,
        html5: {
          vhs: { overrideNative: true },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false,
        },
        sources: currentSources,
        poster: poster,
        playbackRates: [0.5, 1, 1.5, 2],
      }));

      console.log("VideoPlayer: Initialized with sources:", currentSources);

      // Event listeners (Only attached once)
      player.on("play", () => {
        console.log("VideoPlayer: Play event");
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
        console.log("VideoPlayer: Metadata loaded, duration:", player.duration());
        setDuration(player.duration() || 0);
        onLoadedMetadata?.(player.duration() || 0);
        if (initialTime > 0) player.currentTime(initialTime);
      });
      player.on("ended", () => onEnded?.());
      player.on("error", () => {
        const err = player.error();
        const errorMsg = err ? `Error ${err.code}: ${err.message}` : "An unknown error occurred";
        console.error("VideoPlayer: Error:", errorMsg, err);
        setError(errorMsg);
      });

      const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      player.on("fullscreenchange", handleFullscreenChange);
    };

    const frame = requestAnimationFrame(initPlayer);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", () => {});
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Controls visibility logic
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  // Actions
  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playerRef.current.paused()) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    playerRef.current.currentTime(time);
    setCurrentTime(time);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = !isMuted;
    setIsMuted(muted);
    playerRef.current.muted(muted);
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

  /* ---------- HOVER & TOUCH SEEK PREVIEW ---------- */
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number } | null>(null);

  const calculatePosition = (clientX: number) => {
    if (!seekbarRef.current || duration === 0) return null;
    const rect = seekbarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(Math.max(x / rect.width, 0), 1);
    const time = percent * duration;
    return { x, time };
  };

  const syncPreview = (time: number) => {
    if (!previewVideoRef.current) return;
    
    // Debounce seeking to prevent performance issues
    if (previewSeekTimeoutRef.current) {
      clearTimeout(previewSeekTimeoutRef.current);
    }
    
    previewSeekTimeoutRef.current = setTimeout(() => {
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = time;
      }
    }, 50); // 50ms debounce for smooth but responsive preview
  };

  const handleSeekbarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const pos = calculatePosition(e.clientX);
    if (pos) {
      setHoverPosition(pos);
      syncPreview(pos.time);
    }
  };

  const handleSeekbarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const pos = calculatePosition(e.touches[0].clientX);
    if (pos) {
      setHoverPosition(pos);
      syncPreview(pos.time);
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
        isFullscreen ? "fixed inset-0 z-9999 rounded-none" : "rounded-lg border border-white/10",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
        setHoverPosition(null);
      }}
      onClick={togglePlay}
    >
      {/* Force rendering via global styles if Video.js defaults fail */}
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
      `}} />

      <div data-vjs-player ref={videoRef} className="absolute inset-0 w-full h-full bg-black" />
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center animate-in fade-in duration-300 rounded-lg">
          <div className="bg-destructive/20 border border-destructive/50 p-4 rounded-lg max-w-sm">
            <h3 className="text-destructive font-bold mb-2">Playback Error</h3>
            <p className="text-sm text-white/70 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-md text-sm transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* Custom Overlay Controls */}
      <div 
        className={cn(
          "absolute inset-0 z-10 flex flex-col justify-end transition-opacity duration-300 bg-linear-to-t from-black/90 via-transparent to-transparent",
          showControls && !error ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div 
          className="space-y-3 pb-4 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
          <div 
            className="relative group/seekbar pt-4 touch-none"
            onMouseMove={handleSeekbarMouseMove}
            onMouseLeave={() => setHoverPosition(null)}
            onTouchMove={handleSeekbarTouchMove}
            onTouchEnd={handleSeekbarTouchEnd}
            ref={seekbarRef}
          >
            {/* Hover Preview Box */}
            {hoverPosition && (
              <div 
                className="absolute bottom-full mb-3 -translate-x-1/2 flex flex-col items-center animate-in fade-in zoom-in duration-200"
                style={{ left: `${(hoverPosition.time / duration) * 100}%` }}
              >
                <div className=" w-64 sm:w-80 aspect-video bg-black/95 border border-white/20 rounded-lg overflow-hidden p-0.5 shadow-2xl backdrop-blur-md">
                  {/* Dynamic Thumbnail Preview */}
                  <div className="w-full h-full bg-white/5 rounded-md overflow-hidden flex items-center justify-center relative">
                    {previewReady ? (
                      <>
                        <video 
                          ref={previewVideoRef}
                          src={src || sources?.find(s => s.type.includes("mp4"))?.src || sources?.[0]?.src} 
                          className="w-full h-full object-cover" 
                          muted
                          preload="metadata"
                          onLoadedMetadata={() => setPreviewReady(true)}
                          onError={() => setPreviewReady(false)}
                          style={{ transform: `scale(1.1)` }} // Small zoom for effect
                        />
                        <div className="absolute inset-0 bg-black/20" /> {/* Dimmer */}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-white/60">
                        <div className="text-2xl font-bold">{formatTime(hoverPosition.time)}</div>
                        <div className="text-xs">Preview loading...</div>
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono text-white/90">
                      {formatTime(hoverPosition.time)}
                    </div>
                  </div>
                </div>
                {/* Arrow */}
                <div className="w-2.5 h-2.5 bg-black/95 rotate-45 border-r border-b border-white/20 -mt-1.5" />
              </div>
            )}
            
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-white">
              <button 
                onClick={togglePlay}
                className="hover:text-primary transition-colors focus:outline-none"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
              </button>

              <div className="flex items-center gap-2 group/volume">
                <button onClick={toggleMute} className="hover:text-primary focus:outline-none">
                  {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
                <div className="w-0 group-hover/volume:w-20 transition-all duration-300 overflow-hidden">
                   <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="w-20 cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-[13px] font-medium text-white/90">
                {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-4 text-white">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 text-xs font-bold hover:text-primary transition-colors focus:outline-none bg-white/10 px-2 py-1.5 rounded-md border border-white/5">
                  <Settings className="w-4 h-4" />
                  {playbackRate}x
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-black/95 border-white/10 text-white min-w-[100px] backdrop-blur-xl">
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <DropdownMenuItem 
                      key={rate} 
                      onClick={() => handlePlaybackRate(rate)}
                      className={cn(
                        "cursor-pointer focus:bg-primary/20 focus:text-primary text-sm font-medium",
                        playbackRate === rate && "bg-primary/20 text-primary"
                      )}
                    >
                      {rate}x Speed
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button onClick={toggleFullscreen} className="hover:text-primary focus:outline-none transition-colors">
                {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Center Play Button for Idle State */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
           <div className="p-6 bg-primary/90 rounded-full shadow-2xl scale-110 transition-transform group-hover:scale-125">
              <Play className="w-10 h-10 fill-white text-white" />
           </div>
        </div>
      )}
    </div>
  );
}
