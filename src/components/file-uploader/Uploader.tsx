"use client";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import { Card, CardContent } from "../ui/card";
import {
  RenderEmptyState,
  RenderErrorState,
  RenderUploadedState,
  RenderUploadingState,
} from "./RenderState";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { useConstructUrl } from "@/hooks/use-construct-url";
import { transcodeToHLS } from "@/lib/client-video-processor";
import { env } from "@/lib/env";
import { Loader2 } from "lucide-react";

const getS3Url = (key: string) => `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${key}`;

const getVideoDuration = (file: File | string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      if (typeof file !== "string") URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = (e) => {
      if (typeof file !== "string") URL.revokeObjectURL(video.src);
      console.error("Video element error loading metadata:", e);
      reject(new Error("Failed to load video metadata"));
    };
    video.src = typeof file === "string" ? file : URL.createObjectURL(file);
  });
};

const getHLSDuration = async (url: string): Promise<number> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const text = await res.text();
    const matches = text.matchAll(/#EXTINF:([\d.]+),/g);
    let duration = 0;
    for (const match of matches) {
      duration += parseFloat(match[1]);
    }
    return duration;
  } catch (e) {
    console.error("Error parsing HLS duration:", e);
    return 0;
  }
};

export interface SpriteMetadata {
  spriteKey: string;
  spriteCols: number;
  spriteRows: number;
  spriteInterval: number;
  spriteWidth: number;
  spriteHeight: number;
}

interface iAppProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  onDurationChange?: (duration: number) => void;
  onSpriteChange?: (sprite: SpriteMetadata) => void;
  fileTypeAccepted: "image" | "video";
  duration?: number;
  initialSpriteKey?: string | null;
}
interface UploaderState {
  id: string | null;
  file: File | null;
  uploading: boolean;
  progress: number;
  key?: string | null;
  isDeleting: boolean;
  error: boolean;
  objectUrl?: string;
  fileType: "image" | "video";
  transcoding: boolean;
  transcodingProgress: number;
  spriteGenerating: boolean;
  spriteUploadProgress: number;
  isSpriteGenerated?: boolean;
  baseKey?: string | null;
  duration?: number;
  spriteMetadata?: SpriteMetadata;
}

export function Uploader({ onChange, onDurationChange, onSpriteChange, value, fileTypeAccepted, duration: initialDuration, initialSpriteKey }: iAppProps) {
  const spriteInputRef = useRef<HTMLInputElement>(null);
  const fileUrl = useConstructUrl(value || "");
  
  // Extract baseKey more reliably (handles hls/baseKey/master.m3u8 AND baseKey.mp4)
  const extractedBaseKey = value ? (() => {
    if (value.startsWith('hls/')) return value.split('/')[1];
    return value.split('.')[0];
  })() : null;

  const [fileState, setFileState] = useState<UploaderState>({
    error: false,
    file: null,
    id: null,
    uploading: false,
    progress: 0,
    isDeleting: false,
    fileType: fileTypeAccepted,
    key: value,
    objectUrl: value ? fileUrl : undefined,
    transcoding: false,
    transcodingProgress: 0,
    spriteGenerating: false,
    spriteUploadProgress: 0,
    isSpriteGenerated: !!initialSpriteKey,
    baseKey: extractedBaseKey,
    duration: initialDuration,
  });

  // Safety: Prevent closing tab during upload/processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (fileState.uploading || fileState.transcoding || fileState.spriteGenerating) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [fileState.uploading, fileState.transcoding, fileState.spriteGenerating]);

  const uploadFile = useCallback(
    async (file: File) => {
      setFileState((prevState) => ({
        ...prevState,
        uploading: true,
        progress: 0,
      }));

      try {
        if (fileTypeAccepted === "video") {
          // 1. Get Duration and Transcode
          setFileState((s) => ({
            ...s,
            transcoding: true,
            transcodingProgress: 0,
          }));
          
          const duration = await getVideoDuration(file);
          onDurationChange?.(Math.round(duration));
          const { m3u8, segments } = await transcodeToHLS(file, (p) => {
            setFileState((s) => ({ ...s, transcodingProgress: p }));
          }, duration);
          setFileState((s) => ({ ...s, transcoding: false }));

          // 2. Prepare for upload
          setFileState((s) => ({ ...s, uploading: true, progress: 0 }));
          const baseKey = `${uuidv4()}-${file.name.replace(/\.[^/.]+$/, "")}`;

          // Create the list of all files that need pre-signed URLs
          const uploadRequests = [
            {
              fileName: `hls/${baseKey}/master.m3u8`,
              contentType: "application/x-mpegURL",
              size: m3u8.size,
              isImage: false,
              isKeyDirect: true,
              customKey: `hls/${baseKey}/master.m3u8`,
            },
            ...segments.map((segment) => ({
              fileName: `hls/${baseKey}/${segment.name}`,
              contentType: "video/MP2T",
              size: segment.blob.size,
              isImage: false,
              isKeyDirect: true,
              customKey: `hls/${baseKey}/${segment.name}`,
            })),
          ];

          // Batch request all pre-signed URLs at once
          const presignedRes = await fetch("/api/s3/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uploadRequests),
          });

          if (!presignedRes.ok) throw new Error("Failed to get pre-signed URLs");
          const presignedUrls: { presignedUrl: string; key: string }[] = await presignedRes.json();

          // 3. Upload Master Playlist (it's the first in our batch)
          const m3u8Data = presignedUrls[0];
          const masterRes = await fetch(m3u8Data.presignedUrl, {
            method: "PUT",
            body: m3u8,
            headers: { "Content-Type": "application/x-mpegURL" },
          });
          if (!masterRes.ok) throw new Error("Failed to upload master playlist");

          // 4. Upload Segments (Now just one file: index.ts)
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const { presignedUrl } = presignedUrls[i + 1]; // +1 because master was at 0
            
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                  const percent = Math.round((event.loaded / event.total) * 100);
                  setFileState((s) => ({ ...s, progress: percent }));
                }
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
                } else {
                  reject(new Error(`Upload failed for segment ${i}`));
                }
              };
              xhr.onerror = () => reject(new Error(`Network error for segment ${i}`));
              xhr.open("PUT", presignedUrl);
              xhr.setRequestHeader("Content-Type", "video/MP2T");
              xhr.send(segment.blob);
            });
          }

          const finalKey = `${baseKey}.${file.name.split(".").pop()}`;
          setFileState((prevState) => ({
            ...prevState,
            uploading: false,
            progress: 100,
            key: finalKey,
            baseKey: baseKey,
            duration: duration,
          }));
          onChange?.(finalKey);
          toast.success("Video processed and uploaded successfully");
        } else {
          // Image Upload (Keep existing flow)
          const presignedResponse = await fetch("/api/s3/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              size: file.size,
              isImage: true,
            }),
          });

          if (!presignedResponse.ok) throw new Error("Failed to get presigned URL");
          const { presignedUrl, key } = await presignedResponse.json();

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                setFileState((s) => ({
                  ...s,
                  progress: Math.round((event.loaded / event.total) * 100),
                }));
              }
            };
            xhr.onload = () => {
              if (xhr.status === 200 || xhr.status === 204) {
                setFileState((prevState) => ({
                  ...prevState,
                  uploading: false,
                  progress: 100,
                  key: key,
                }));
                onChange?.(key);
                toast.success("Image uploaded successfully");
                resolve();
              } else {
                reject(new Error("File upload failed"));
              }
            };
            xhr.onerror = () => reject(new Error("File upload failed"));
            xhr.open("PUT", presignedUrl);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
          });
        }
      } catch (error) {
        toast.error("Something went wrong during upload");
        setFileState((prevState) => ({
          ...prevState,
          uploading: false,
          transcoding: false,
          progress: 0,
          error: true,
        }));
      }
    },
    [onChange, fileTypeAccepted]
  );

  const handleManualSpriteUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setFileState(s => ({ ...s, spriteGenerating: true, spriteUploadProgress: 1 }));
      toast.info("Preparing upload...");

      let currentDuration = fileState.duration;
      let currentBaseKey = fileState.baseKey;

      // 1. Recover Base Key if missing
      if (!currentBaseKey && value) {
        if (value.startsWith('hls/')) currentBaseKey = value.split('/')[1];
        else currentBaseKey = value.split('.')[0];
      }
      
      console.log("Manual Sprite Upload - Pre-recovery check:", { 
        value, 
        currentBaseKey, 
        currentDuration,
      });

      // 2. Recover Duration if missing
      if (!currentDuration && value) {
        // If the key is mistakenly an image, WE CANNOT RECOVER DURATION
        if (value.match(/\.(jpg|jpeg|png|webp)$/i)) {
          const errorMsg = `CANNOT RECOVER DURATION: Video field points to an image file (${value}). Please re-upload the actual video file first.`;
          console.error(errorMsg);
          toast.error(errorMsg);
          setFileState(s => ({ ...s, spriteGenerating: false }));
          return;
        }

        try {
          // If it's a video, we ALWAYS try HLS first because transcoding creates it
          const hlsKey = value.startsWith('hls/') ? value : `hls/${currentBaseKey}/master.m3u8`;
          const playlistUrl = getS3Url(hlsKey);
          
          console.log("Attempting HLS duration recovery from:", playlistUrl);
          currentDuration = await getHLSDuration(playlistUrl);
          
          // Fallback to MP4 only if HLS failed
          if (!currentDuration) {
            console.log("HLS recovery failed, attempting MP4 fallback...");
            const mp4Key = value.startsWith('hls/') ? `${currentBaseKey}.mp4` : value;
            const mp4Url = getS3Url(mp4Key);
            currentDuration = await getVideoDuration(mp4Url);
          }

          if (currentDuration) {
            onDurationChange?.(Math.round(currentDuration));
            console.log("Recovered duration:", currentDuration);
          }
        } catch (e) {
          console.error("Failed to recover duration:", e);
        }
      }

      if (!currentBaseKey || !currentDuration) {
        setFileState(s => ({ ...s, spriteGenerating: false }));
        const errorMsg = `Video details missing (Key: ${currentBaseKey}, Dur: ${currentDuration}). Please verify your video upload is correct.`;
        console.error(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.info("Uploading custom sprite sheet...");

      // Standard metadata matching the Python script (Smart Density)
      const cols = 10;
      // 1. Min 100 frames
      // 2. Target 30s interval for long videos
      // 3. Cap at 300 frames
      const totalFrames = Math.max(100, Math.min(Math.floor(currentDuration / 30), 300));
      
      const interval = currentDuration / totalFrames;
      const rows = Math.ceil(totalFrames / cols);

      const spriteKey = `sprites/${currentBaseKey}/sprite.jpg`;
      const response = await fetch("/api/s3/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "sprite.jpg",
          contentType: "image/jpeg",
          size: file.size,
          baseKey: currentBaseKey,
          isImage: true,
          isKeyDirect: true,
          customKey: spriteKey
        }),
      });

      if (!response.ok) throw new Error("Failed to get upload URL");
      const { presignedUrl, key } = await response.json();
      
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setFileState((s) => ({ ...s, spriteUploadProgress: percent }));
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error("Upload failed"));
        xhr.onerror = () => reject(new Error("Upload error"));
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        xhr.send(file);
      });

      const metadata = {
        spriteKey: key,
        spriteCols: cols,
        spriteRows: rows,
        spriteInterval: interval,
        spriteWidth: 160,
        spriteHeight: 90,
      };

      onSpriteChange?.(metadata);

      setFileState(s => ({ 
        ...s, 
        isSpriteGenerated: true,
        spriteMetadata: metadata,
        baseKey: currentBaseKey,
        duration: currentDuration
      }));
      toast.success("Custom sprite uploaded successfully");
    } catch (e) {
      console.error("Manual sprite upload failed:", e);
      toast.error("Failed to upload custom sprite.");
    } finally {
      setFileState(s => ({ ...s, spriteGenerating: false }));
    }
  }, [fileState.baseKey, fileState.duration, onSpriteChange, value, onDurationChange]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];

        if (fileState.objectUrl && fileState.objectUrl.startsWith("http")) {
          URL.revokeObjectURL(fileState.objectUrl);
        }

        setFileState({
          file,
          uploading: false,
          progress: 0,
          objectUrl: URL.createObjectURL(file),
          error: false,
          id: uuidv4(),
          isDeleting: false,
          fileType: fileTypeAccepted,
          transcoding: false,
          transcodingProgress: 0,
          spriteGenerating: false,
          spriteUploadProgress: 0,
        });

        uploadFile(file);
      }
    },
    [fileState.objectUrl, uploadFile, fileTypeAccepted]
  );

  async function handleRemoveFile() {
    if (fileState.isDeleting || !fileState.objectUrl) return;
    try {
      setFileState((prevState) => ({
        ...prevState,
        isDeleting: true,
      }));

      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: fileState.key,
        }),
      });
      if (!response.ok) {
        toast.error("Failed to delete file");
        setFileState((prevState) => ({
          ...prevState,
          isDeleting: false,
          error: true,
        }));
        return;
      }
      if (fileState.objectUrl && fileState.objectUrl.startsWith("http")) {
        URL.revokeObjectURL(fileState.objectUrl);
      }

      onChange?.(null);

      setFileState((prevState) => ({
        ...prevState,
        file: null,
        uploading: false,
        progress: 0,
        error: false,
        fileType: fileTypeAccepted,
        id: null,
        isDeleting: false,
        objectUrl: undefined,
        transcoding: false,
        transcodingProgress: 0,
        spriteGenerating: false,
        spriteUploadProgress: 0,
      }));

      toast.success("File removed successfully");
    } catch {
      toast.error("Error removing file please try again later");
      setFileState((prevState) => ({
        ...prevState,
        isDeleting: false,
        error: true,
      }));
    }
  }

  function rejectedFiles(fileRejection: FileRejection[]) {
    if (fileRejection.length) {
      const tooManyFiles = fileRejection.find(
        (rejection) => rejection.errors[0].code === "too-many-files"
      );
      const fileSizeExceeded = fileRejection.find(
        (rejection) => rejection.errors[0].code === "file-too-large"
      );
      if (tooManyFiles) {
        toast.error("Only one file can be uploaded at a time.");
      }
      if (fileSizeExceeded) {
        toast.error("The file exceeds the maximum size of 5MB.");
      }
    }
  }

  function renderContent() {
    // 1. If currently uploading or transcoding the MAIN video, show full-screen progress
    if (fileState.uploading || fileState.transcoding) {
      let label = "Uploading...";
      let progress = fileState.progress;

      if (fileState.transcoding) {
        label = "Optimizing for streaming...";
        progress = fileState.transcodingProgress;
      }

      return (
        <RenderUploadingState
          progress={progress}
          file={fileState.file}
          label={label}
        />
      );
    }

    // 2. If we have an error, show it
    if (fileState.error) {
      return <RenderErrorState />;
    }

    // 3. If the file is uploaded (objectUrl exists), show the preview
    // Even if sprite generation is still running in the background!
    if (fileState.objectUrl) {
      if (fileState.isDeleting) {
        return (
          <div className="flex flex-col items-center justify-center space-y-4 w-full h-full">
            <Loader2 className="size-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium animate-pulse text-blue-500">Removing from storage...</p>
          </div>
        );
      }

      const isExistingVideo = !fileState.file;
      const hlsKey = (isExistingVideo && fileState.key) ? `hls/${fileState.key.replace(/\.[^/.]+$/, "")}/master.m3u8` : undefined;
      const hlsUrl = hlsKey ? useConstructUrl(hlsKey) : undefined;

      return (
        <div className="relative w-full h-full">
          <RenderUploadedState
            previewUrl={fileState.objectUrl}
            hlsUrl={hlsUrl}
            handleRemoveFile={handleRemoveFile}
            isDeleting={fileState.isDeleting}
            fileType={fileTypeAccepted}
            isSpriteGenerated={fileState.isSpriteGenerated}
            spriteGenerating={fileState.spriteGenerating}
            spriteMetadata={fileState.spriteMetadata}
            onDurationLoaded={(d) => {
              if (!fileState.duration) {
                console.log("Uploader: Auto-captured duration from player:", d);
                setFileState(s => ({ ...s, duration: d }));
                onDurationChange?.(Math.round(d));
              }
            }}
            onManualSpriteClick={() => spriteInputRef.current?.click()}
          />
          {/* Background Upload Indicator */}
          {fileState.spriteGenerating && (
            <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm z-20">
               <Loader2 className="size-3 animate-spin text-white" />
               <span className="text-[10px] text-white/90 font-medium">
                 {`Uploading Sprite (${fileState.spriteUploadProgress}%)`}
               </span>
            </div>
          )}
        </div>
      );
    }

    return <RenderEmptyState isDragActive={isDragActive} />;
  }

  useEffect(() => {
    if (fileState.objectUrl && fileState.objectUrl.startsWith("http")) {
      URL.revokeObjectURL(fileState.objectUrl);
    }
  }, [fileState.objectUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept:
      fileTypeAccepted === "video" ? { "video/*": [] } : { "image/*": [] },
    maxFiles: 1,
    multiple: false,
    maxSize:
      fileTypeAccepted === "video" ? 2 * 1024 * 1024 * 1024 : 5 * 1024 * 1024,
    onDropRejected: rejectedFiles,
    disabled: fileState.uploading || !!fileState.objectUrl || fileState.transcoding,
  });
  return (
    <Card
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed transition-colors duration-200 ease-ini-out w-full h-64 rounded-lg",
        isDragActive
          ? "border-primary bg-primary/10 border-solid"
          : "border-border hover:border-primary"
      )}
    >
      <CardContent className="flex items-center justify-center h-full w-full p-4">
        <input {...getInputProps()} />
        <input 
          ref={spriteInputRef}
          type="file"
          accept="image/jpeg"
          className="hidden"
          onChange={handleManualSpriteUpload}
        />
        {renderContent()}
      </CardContent>
    </Card>
  );
}
