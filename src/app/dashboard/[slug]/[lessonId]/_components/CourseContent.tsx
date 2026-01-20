"use client";

import { LessonContentType } from "@/app/data/course/get-lesson-content";
import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti2 } from "@/hooks/use-confetti2";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { BookIcon, CheckCircle } from "lucide-react";
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

export function CourseContent({ data }: iAppProps) {
  const [isPending, startTransition] = useTransition();
  const { triggerConfetti } = useConfetti2();

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

  useEffect(() => {
    if (!videoKey) return;

    // Try to get HLS URL first
    const hlsKey = `hls/${videoKey.replace(/\.[^/.]+$/, "")}/master.m3u8`;
    
    getSignedVideoUrl(hlsKey).then((url) => {
    
      if (url) {
        setHlsUrl(url);
      }
    });

    // Get MP4 URL as fallback
    
    getSignedVideoUrl(videoKey).then((url) => {
      
      setVideoUrl(url);
    });
  }, [videoKey]);

  useEffect(() => {
    if (hlsUrl && videoRef.current) {
      const video = videoRef.current;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setHlsUrl(null); // This will trigger the MP4 fallback in render
            hls.destroy();
          }
        });

        return () => hls.destroy();
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        video.onerror = () => {
          setHlsUrl(null);
        };
      }
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
          // HLS is being handled by hls.js via ref, but we can provide a native fallback here too
          <source src={hlsUrl} type="application/x-mpegURL" />
        ) : (
          videoUrl && <source src={videoUrl} type="video/mp4" />
        )}
        Your browser does not support HTML5 video.
      </video>
    </div>
  );
}

  // ==============================
  // MARK COMPLETE HANDLER
  // ==============================
  function onSubmit() {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        markLessonComplete(data.id, data.Chapter.Course.slug)
      );

      if (error) {
        toast.error("An unexpected error occurred. Please try again later.");
        return;
      }

      if (result.status === "success") {
        toast.success(result.message);
        triggerConfetti();
      } else {
        toast.error(result.message);
      }
    });
  }

  const isCompleted = data.lessonProgress?.length > 0;
  const hasVideo = Boolean(data.videoKey);

  return (
    <div className="flex flex-col bg-background md:pl-4 lg:pl-6">
      {/* ======================= */}
      {/* VIDEO PLAYER */}
      {/* Order 2 on mobile, Order 1 on desktop */}
      <div className="order-2 md:order-1 w-full">
        <VideoPlayer
          thumbnailkey={data.thumbnailKey ?? ""}
          videoKey={data.videoKey ?? ""}
        />
      </div>

      {/* ======================= */}
      {/* LESSON TITLE */}
      {/* Order 3 on mobile, Order 2 on desktop */}
      <div className="order-3 md:order-2 pt-6 pb-2 md:pb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
          {data.title}
        </h1>
      </div>

      {/* ======================= */}
      {/* ACTION BUTTONS */}
      {/* Order 1 on mobile, Order 3 on desktop */}
      <div className="order-1 md:order-3 flex items-center justify-between gap-4 pb-4 pt-2 md:pt-6 md:pb-0 md:border-t md:border-b-0 mb-0">
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
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="gap-2 shrink-0">
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
        )}
      </div>
    </div>
  )
}
