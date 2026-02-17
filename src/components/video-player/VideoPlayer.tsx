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
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import Loader from "@/components/ui/Loader";

export interface VideoSource {
  src: string;
  type: string;
}

export interface SpriteMetadata {
  url: string;
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
            smoothQualityChange: true,
            useDevicePixelRatio: true,
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
        setDuration(player.duration() || 0);
        onLoadedMetadata?.(player.duration() || 0);
        if (initialTime > 0) player.currentTime(initialTime);
      });
      player.on("ended", () => onEnded?.());
      player.on("error", () => {
        const err = player.error();
        const errorMsg = err ? `Error ${err.code}: ${err.message}` : "An unknown error occurred";
        setError(errorMsg);
      });

      const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      player.on("fullscreenchange", handleFullscreenChange);
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

  // Preload sprite images so they're cached by browser
  const preloadSpriteImages = (cues: any[], vttUrl: string) => {
    if (cues.length === 0) return;
    
    const baseUrl = vttUrl.substring(0, vttUrl.lastIndexOf("/") + 1);
    const uniqueImages = new Set<string>();
    
    // Collect all unique sprite image URLs
    cues.forEach(cue => {
      if (cue.url) {
        const imageUrl = cue.url.startsWith("http") ? cue.url : baseUrl + cue.url;
        uniqueImages.add(imageUrl);
      }
    });
    
    console.log(`VideoPlayer: Preloading ${uniqueImages.size} sprite images...`);
    
    // Preload each unique image
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


  const getSpritePosition = (time: number) => {
    if (!spriteMetadata) return null;

    // VTT Logic (New)
    if (vttCues.length > 0) {
        const cue = vttCues.find(c => time >= c.startTime && time < c.endTime);
        if (!cue) {
            // console.log("VideoPlayer: No cue found for time", time);
            return null;
        }
        
        // Construct full URL relative to VTT or absolute
        const baseUrl = spriteMetadata.url.substring(0, spriteMetadata.url.lastIndexOf("/") + 1);
        const imageUrl = cue.url.startsWith("http") ? cue.url : baseUrl + cue.url;
        
        // console.log("VideoPlayer: Showing sprite", imageUrl, cue.x, cue.y);

        return {
            backgroundImage: `url(${imageUrl})`,
            backgroundPosition: `-${cue.x}px -${cue.y}px`,
            backgroundSize: "initial", // Size is irrelevant for VTT as we just clip
            width: cue.w,
            height: cue.h,
        };
    }

    // Legacy Grid Logic
    // Guard against VTT-based metadata falling through (cols=0)
    if (!spriteMetadata.cols || !spriteMetadata.rows || !spriteMetadata.interval) {
        return null;
    }
    const index = Math.min(
      Math.floor(time / spriteMetadata.interval),
      spriteMetadata.cols * spriteMetadata.rows - 1
    );
    const col = index % spriteMetadata.cols;
    const row = Math.floor(index / spriteMetadata.cols);
    return {
      backgroundImage: `url(${spriteMetadata.url})`,
      backgroundPosition: `-${col * spriteMetadata.width}px -${row * spriteMetadata.height}px`,
      backgroundSize: `${spriteMetadata.cols * spriteMetadata.width}px ${spriteMetadata.rows * spriteMetadata.height}px`,
      width: spriteMetadata.width,
      height: spriteMetadata.height,
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
      onMouseLeave={() => {
        if (isPlaying) setShowControls(false);
        setHoverPosition(null);
      }}
      onClick={togglePlay}
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
        ${currentTime > 0 ? `
          .video-js .vjs-poster {
            display: none !important;
          }
        ` : ''}
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

      <div 
        className={cn(
          "absolute inset-0 z-10 flex flex-col justify-end transition-opacity duration-300 bg-linear-to-t from-black/90 via-transparent to-transparent",
          showControls && !error ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div 
          className="space-y-3 pb-4 px-4"
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={() => setHoverPosition(null)}
        >
          <div 
            className="relative group/seekbar pt-4 touch-none"
            onMouseMove={handleSeekbarMouseMove}
            onMouseLeave={() => setHoverPosition(null)}
            onTouchMove={handleSeekbarTouchMove}
            onTouchEnd={handleSeekbarTouchEnd}
            ref={seekbarRef}
          >
            {hoverPosition && (
              <div 
                className="absolute bottom-full mb-3 -translate-x-1/2 flex flex-col items-center animate-in fade-in zoom-in duration-150 pointer-events-none"
                style={{ left: `${(hoverPosition.time / duration) * 100}%` }}
              >
                {spriteMetadata ? (() => {
                  const spritePos = getSpritePosition(hoverPosition.time);
                  return spritePos ? (
                    // Move responsive scaling here to the container
                    // origin-bottom ensures it grows upwards from the seekbar
                    <div className="bg-black/95 border border-white/20 rounded-lg overflow-hidden p-0.5 shadow-2xl backdrop-blur-md origin-bottom scale-[0.5] sm:scale-[0.7] md:scale-[0.9] transition-transform duration-200">
                      <div className="relative rounded-md overflow-hidden bg-muted flex items-center justify-center" style={{ width: `${spritePos.width}px`, height: `${spritePos.height}px` }}>
                        <div
                          style={{
                            width: `${spritePos.width}px`,
                            height: `${spritePos.height}px`,
                            backgroundImage: spritePos.backgroundImage,
                            backgroundPosition: spritePos.backgroundPosition,
                            backgroundSize: spritePos.backgroundSize,
                            backgroundRepeat: 'no-repeat',
                          }}
                        />
                        {/* Overlay label */}
                        <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] font-mono text-white/90">
                          {formatTime(hoverPosition.time)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-black/95 border border-white/20 rounded-lg overflow-hidden p-0.5 shadow-2xl backdrop-blur-md flex items-center justify-center w-32 aspect-video">
                        <Loader size={16} />
                    </div>
                  );
                })() : (
                  <div className="bg-black/90 border border-white/20 rounded-lg px-3 py-2 shadow-2xl backdrop-blur-md">
                    <div className="text-sm font-mono text-white/90">
                      {formatTime(hoverPosition.time)}
                    </div>
                  </div>
                )}
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
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs font-bold hover:text-primary transition-colors focus:outline-none bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-md border border-white/10">
                    <Settings className="w-4 h-4" />
                    {playbackRate}x
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  side="top"
                  align="end"
                  sideOffset={12}
                  avoidCollisions
                  container={isFullscreen ? containerRef.current : undefined}
                  className="bg-black/95 border-white/20 text-white w-32 sm:w-40 backdrop-blur-2xl p-1 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/5 mb-1">
                    Speed
                  </div>
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <DropdownMenuItem 
                      key={rate} 
                      onClick={() => handlePlaybackRate(rate)}
                      className={cn(
                        "cursor-pointer focus:bg-primary/20 focus:text-primary text-[12px] font-medium px-2.5 py-2 rounded-md transition-colors",
                        playbackRate === rate && "bg-primary/20 text-primary font-bold"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{rate === 1 ? "Normal" : `${rate}x`}</span>
                        {playbackRate === rate && <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]" />}
                      </div>
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

      {!isPlaying && (
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
