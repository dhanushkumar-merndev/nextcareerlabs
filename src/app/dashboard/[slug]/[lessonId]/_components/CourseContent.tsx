"use client";

import { LessonContentType } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { BookIcon, CheckCircle, X } from "lucide-react";
import { markLessonComplete } from "../actions";
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

interface iAppProps {
  data: LessonContentType;
}

// ==============================
// VIDEO PLAYER COMPONENT
// ==============================

function VideoPlayer({
  thumbnailkey,
  videoKey,
}: {
  thumbnailkey: string;
  videoKey: string;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbnailUrl = useConstructUrl(thumbnailkey);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!videoKey) return;

    const hlsKey = `hls/${videoKey.replace(/\.[^/.]+$/, "")}/master.m3u8`;

    getSignedVideoUrl(hlsKey).then((url) => {
      if (url) {
        setHlsUrl(url);
      } else {
        getSignedVideoUrl(videoKey).then(setVideoUrl);
      }
    });
  }, [videoKey]);

  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return;

    const video = videoRef.current;

    // Safari native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }

    if (Hls.isSupported()) {
      hlsRef.current?.destroy();

      const hls = new Hls();
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
          setHlsUrl(null);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [hlsUrl]);

  // No video case
  if (!videoKey) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center border">
        <BookIcon className="size-16 text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">
          This lesson does not have a video yet
        </p>
      </div>
    );
  }

  // Loading signed URL
  if (!videoUrl && !hlsUrl) {
    return (
      <div className="aspect-video bg-muted rounded-lg border animate-pulse" />
    );
  }

  // With video (STREAMING)
  return (
    <div className="aspect-video bg-muted rounded-lg border overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        preload="metadata"
        playsInline
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        poster={thumbnailUrl}
        crossOrigin="anonymous"
      >
        {hlsUrl ? (
          <source src={hlsUrl} type="application/x-mpegURL" />
        ) : (
          videoUrl && <source src={videoUrl} type="video/mp4" />
        )}
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

  // ==============================
  // MARK COMPLETE HANDLER
  // ==============================
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
        toast.success(result.message);
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
      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col py-2 md:pl-6 overflow-y-auto">
        {/* VIDEO PLAYER */}
        <div className="order-2 md:order-1 w-full">
          <VideoPlayer
            thumbnailkey={data.thumbnailKey ?? ""}
            videoKey={data.videoKey ?? ""}
          />
        </div>

        {/* LESSON TITLE */}
        <div className="order-3 md:order-2 pt-4 md:pb-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
            {data.title}
          </h1>
        </div>

        {/* ACTION BUTTONS */}
        <div className="order-1 md:order-3 flex items-center justify-between gap-4 pb-6 md:pt-6 md:pb-0 md:border-t mb-0">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <Button disabled className="gap-2">
                <CheckCircle className="size-4" />
                Completed
              </Button>
            ) : (
              <Button
                disabled={isPending || !hasVideo}
                onClick={onSubmit}
                className="gap-2"
              >
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

      {/* BOTTOM DESCRIPTION PANEL (DESKTOP OVERLAY) */}
      {data.description && isDescriptionOpen && (
        <div className="absolute bottom-0 left-6 right-0 h-[85vh] z-30 hidden md:flex flex-col 
          min-h-0
          border border-border shadow-xl
          bg-background/95 transition-all duration-500 
          animate-in slide-in-from-bottom overflow-hidden shrink-0 rounded-t-3xl">

          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <IconFileText className="size-5 text-primary" />
              Description
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setIsDescriptionOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6 transition-all duration-300 scrollbar-thin scrollbar-thumb-primary/20">
            <div className="pb-32">
              <RenderDescription json={JSON.parse(data.description)} />
            </div>
          </div>

        </div>
      )}

    </div>
  );
}