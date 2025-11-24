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
import { useTransition } from "react";

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
    const videoUrl = useConstructUrl(videoKey);
    const thumbnailUrl = useConstructUrl(thumbnailkey);

    if (!videoKey) {
      return (
        <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center">
          <BookIcon className="size-16 text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            This lesson does not have a video yet
          </p>
        </div>
      );
    }

    return (
      <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
        <video
          className="w-full h-full object-cover"
          controls
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()} // Disable right-click
          poster={thumbnailUrl}
        >
          <source src={videoUrl} type="video/mp4" />
          <source src={videoUrl} type="video/webm" />
          <source src={videoUrl} type="video/ogg" />
          Your browser does not support HTML5 video.
        </video>
      </div>
    );
  }

  // ==============================
  // MARK COMPLETE FUNCTION
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
    <div className="flex flex-col h-full bg-background pl-6">
      {/* ======================= */}
      {/* VIDEO PLAYER */}
      {/* ======================= */}
      <VideoPlayer
        thumbnailkey={data.thumbnailKey ?? ""}
        videoKey={data.videoKey ?? ""}
      />

      {/* ======================= */}
      {/* ACTION BUTTON */}
      {/* ======================= */}
      <div className="py-4 border-b">
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

      {/* ======================= */}
      {/* LESSON DETAILS */}
      {/* ======================= */}
      <div className="space-y-3 pt-3 pb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {data.title}
        </h1>

        {data.description && (
          <RenderDescription json={JSON.parse(data.description)} />
        )}
      </div>
    </div>
  );
}
