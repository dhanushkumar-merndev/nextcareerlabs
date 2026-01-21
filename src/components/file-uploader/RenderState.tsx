import { cn } from "@/lib/utils";
import { CloudUploadIcon, ImageIcon, Loader2, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import Image from "next/image";
import CircularProgressColorDemo from "@/components/ui/progress-10";
import Hls from "hls.js";
import { useEffect, useRef } from "react";
export function RenderEmptyState({ isDragActive }: { isDragActive: boolean }) {
  return (
    <div className="text-center">
      <div className="flex items-center mx-auto justify-center size-12 rounded-full bg-muted mb-4">
        <CloudUploadIcon
          className={cn(
            "size-6 text-muted-foreground",
            isDragActive && "text-primary"
          )}
        />
      </div>
      <p className="text-muted-foreground text-base mb-4">
        Drop your files here or{" "}
        <span className="text-primary cursor-pointer">click to upload</span>
      </p>
      <Button type="button" className="cursor-pointer">
        Upload
      </Button>
    </div>
  );
}

export function RenderErrorState() {
  return (
    <div className="text-center">
      <div className="text-destructive flex items-center mx-auto justify-center size-12 rounded-full bg-destructive/30 mb-4">
        <ImageIcon className={cn("size-6 ")} />
      </div>
      <p className=" text-base font-semibold">Upload Failed</p>
      <p className="text-muted-foreground text-sm mt-1">something went wrong</p>
      <Button type="button" className="mt-4 cursor-pointer">
        Retry fle selection
      </Button>
    </div>
  );
}


export function RenderUploadedState({
  previewUrl,
  isDeleting,
  handleRemoveFile,
  fileType,
  hlsUrl,
}: {
  previewUrl: string;
  isDeleting: boolean;
  handleRemoveFile: () => void;
  fileType: "image" | "video";
  hlsUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  /* ---------- INIT HLS PREVIEW ---------- */
  useEffect(() => {
    if (fileType !== "video" || !videoRef.current) return;

    const video = videoRef.current;

    // Cleanup previous instance
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (hlsUrl) {
      // Safari (native HLS)
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        video.currentTime = 0;
        return;
      }

      // Chrome / Firefox / Edge
      if (Hls.isSupported()) {
        const hls = new Hls({ startPosition: 0 });
        hlsRef.current = hls;

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
            video.src = previewUrl; // fallback to MP4 preview
          }
        });
      }
    } else {
      // No HLS → normal preview
      video.src = previewUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [hlsUrl, fileType, previewUrl]);

  return (
    <div className="relative group w-full h-full flex items-center justify-center">
      {fileType === "video" ? (
        <video
          ref={videoRef}
          controls
          playsInline
          className={`
            w-full h-full rounded-md object-contain
            accent-primary`}
          
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          crossOrigin="anonymous"
        />
      ) : (
        <div className="relative w-full h-full">
          <Image
            src={previewUrl}
            alt="Upload File"
            fill
            className="object-contain p-2"
            sizes="300px"
            loading="eager"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Delete Button */}
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-4 right-4"
        onClick={handleRemoveFile}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <XIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}

export function RenderUploadingState({
  progress,
  file,
  label = "Uploading...",
}: {
  progress: number;
  file?: File | null;
  label?: string;
}) {
  return (
    <div className="text-center flex justify-center items-center flex-col w-full px-8">
      <CircularProgressColorDemo progress={progress} />
      <p className="mt-2 text-sm font-medium text-foreground animate-pulse">
        {label}
      </p>
      {file && (
        <p className="mt-1 text-xs text-muted-foreground truncate max-w-xs mx-auto">
          {file.name}
        </p>
      )}
    </div>
  );
}
