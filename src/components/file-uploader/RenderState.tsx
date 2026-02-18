import { cn } from "@/lib/utils";
import { CloudUploadIcon, ImageIcon, Loader2, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import Image from "next/image";
import CircularProgressColorDemo from "@/components/ui/progress-10";
import Hls from "hls.js";
import { useEffect, useRef } from "react";
import { VideoPlayer } from "../video-player/VideoPlayer";
import { useConstructUrl } from "@/hooks/use-construct-url";
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
  isSpriteGenerated,
  spriteMetadata,
  onDurationLoaded,
}: {
  previewUrl: string;
  isDeleting: boolean;
  handleRemoveFile: () => void;
  fileType: "image" | "video";
  hlsUrl?: string;
  onGenerateSprites?: () => void;
  isSpriteGenerated?: boolean;
  spriteGenerating?: boolean;
  spriteMetadata?: any;
  onDurationLoaded?: (duration: number) => void;
}) {
  const spriteProps = spriteMetadata ? {
    url: useConstructUrl(spriteMetadata.spriteKey),
    lowResUrl: spriteMetadata.lowResKey ? useConstructUrl(spriteMetadata.lowResKey) : undefined,
    cols: spriteMetadata.spriteCols || 10,
    rows: spriteMetadata.spriteRows || 0,
    interval: spriteMetadata.spriteInterval || 10,
    width: spriteMetadata.spriteWidth || 240,
    height: spriteMetadata.spriteHeight || 135,
  } : undefined;

  useEffect(() => {
    if (spriteMetadata) console.log("RenderUploadedState: spriteMetadata", spriteMetadata);
    if (spriteProps) console.log("RenderUploadedState: spriteProps", spriteProps);
  }, [spriteMetadata, spriteProps]);

  return (
    <div className="relative group w-full h-full flex items-center justify-center">
      {fileType === "video" ? (
        <VideoPlayer
          sources={[
            ...(hlsUrl ? [{ src: hlsUrl, type: "application/x-mpegURL" }] : []),
            { src: previewUrl, type: "video/mp4" },
          ]}
          spriteMetadata={spriteProps}
          className="w-full h-full"
          onLoadedMetadata={onDurationLoaded}
          captionUrl={hlsUrl ? hlsUrl.replace("master.m3u8", "caption.vtt") : undefined}
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
        className="absolute top-4 right-4 z-50 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          handleRemoveFile();
        }}
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
