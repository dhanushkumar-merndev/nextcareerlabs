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
import { SpriteGenerator } from "@/lib/video/sprite-generator";

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
  spriteCols?: number;
  spriteRows?: number;
  spriteInterval?: number;
  spriteWidth?: number;
  spriteHeight?: number;
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
    isSpriteGenerated: !!initialSpriteKey || !!extractedBaseKey,
    spriteMetadata: initialSpriteKey ? {
        spriteKey: initialSpriteKey
    } : (extractedBaseKey ? {
        spriteKey: `sprites/${extractedBaseKey}/thumbnails.vtt`
    } : undefined),
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

          // 1.5 Generate Sprites (New Auto Step)
          setFileState((s) => ({ ...s, spriteGenerating: true, spriteUploadProgress: 0 }));
          toast.info("Generating thumbnails...");
          
          let spriteResult: any = null;
          try {
             const generator = new SpriteGenerator();
             spriteResult = await generator.generate(file, (progress, status) => {
                setFileState(s => ({ ...s, spriteUploadProgress: progress }));
             });
          } catch (spriteError) {
             console.error("Auto sprite generation failed:", spriteError);
             toast.error("Thumbnail generation failed, but video will still upload.");
          }

          // 2. Prepare for upload
          setFileState((s) => ({ ...s, uploading: true, progress: 0, spriteGenerating: false }));
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

          // Add Sprites to Upload Request if generated
          let vttKey: string | null = null;
          if (spriteResult) {
             // Sprites
             spriteResult.spriteBlobs.forEach((blob: Blob, index: number) => {
                const name = spriteResult.spriteFileNames[index];
                uploadRequests.push({
                    fileName: name,
                    contentType: "image/jpeg",
                    size: blob.size,
                    isImage: true,
                    isKeyDirect: true,
                    customKey: `sprites/${baseKey}/${name}`
                });
             });
             // VTT
             vttKey = `sprites/${baseKey}/thumbnails.vtt`;
             uploadRequests.push({
                fileName: "thumbnails.vtt",
                contentType: "text/vtt",
                size: spriteResult.vttBlob.size,
                isImage: false,
                isKeyDirect: true,
                customKey: vttKey
             });
          }

          // Batch request all pre-signed URLs at once
          const presignedRes = await fetch("/api/s3/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uploadRequests),
          });

          if (!presignedRes.ok) throw new Error("Failed to get pre-signed URLs");
          const presignedUrls: { presignedUrl: string; key: string }[] = await presignedRes.json();

          // 3. Upload Master Playlist (index 0)
          const m3u8Data = presignedUrls[0];
          await fetch(m3u8Data.presignedUrl, {
            method: "PUT",
            body: m3u8,
            headers: { "Content-Type": "application/x-mpegURL" },
          });

          // 4. Upload Segments & Sprites
          // We map the original requests to the presigned URLs. 
          // presignedUrls matches uploadRequests index-for-index.
          
          let completedUploads = 0;
          const totalUploads = uploadRequests.length - 1; // Exclude master which is done

          const uploadFileToS3 = async (index: number, blob: Blob, contentType: string) => {
             const { presignedUrl } = presignedUrls[index];
             await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.onprogress = (event) => {
                   // ...
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        console.log(`Uploader: Success ${contentType} (${blob.size}b)`);
                        resolve();
                    } else {
                        console.error(`Uploader: Failed ${contentType} status ${xhr.status}`);
                        reject();
                    }
                };
                xhr.onerror = () => {
                    console.error(`Uploader: Network Error ${contentType}`);
                    reject();
                };
                xhr.open("PUT", presignedUrl);
                xhr.setRequestHeader("Content-Type", contentType);
                xhr.send(blob);
             });
             completedUploads++;
             setFileState((s) => ({ ...s, progress: Math.round((completedUploads / totalUploads) * 100) }));
          };

          // HLS Segments (indices 1 to segments.length)
          const segmentPromises = segments.map((segment, i) => 
             uploadFileToS3(i + 1, segment.blob, "video/MP2T")
          );

          // Sprites (indices after segments)
          const spritePromises: Promise<void>[] = [];
          if (spriteResult) {
             let startIndex = 1 + segments.length;
             // Sprite Images
             spriteResult.spriteBlobs.forEach((blob: Blob, i: number) => {
                spritePromises.push(uploadFileToS3(startIndex + i, blob, "image/jpeg"));
             });
             // VTT
             const vttIndex = startIndex + spriteResult.spriteBlobs.length;
             spritePromises.push(uploadFileToS3(vttIndex, spriteResult.vttBlob, "text/vtt"));
          }

          await Promise.all([...segmentPromises, ...spritePromises]);

          const finalKey = `${baseKey}.${file.name.split(".").pop()}`;

          // Update Metadata if sprites were generated
          if (vttKey) {
             const metadata: SpriteMetadata = {
                spriteKey: vttKey, 
             };
             onSpriteChange?.(metadata);
             setFileState(s => ({ ...s, isSpriteGenerated: true, spriteMetadata: metadata }));
          }

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
    if (fileState.uploading || fileState.transcoding || fileState.spriteGenerating) {
      let label = "Uploading...";
      let progress = fileState.progress;

      if (fileState.transcoding) {
        label = "Optimizing for streaming...";
        progress = fileState.transcodingProgress;
      }
      else if (fileState.spriteGenerating) {
        label = "Generating thumbnails...";
        progress = fileState.spriteUploadProgress;
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
      
      // Reactive Sprite Metadata: Use state if available (new upload), otherwise derive from key (existing)
      const effectiveSpriteMetadata = fileState.spriteMetadata || (extractedBaseKey ? {
          spriteKey: `sprites/${extractedBaseKey}/thumbnails.vtt`
      } : undefined);

      return (
        <div className="relative w-full h-full">
          <RenderUploadedState
            previewUrl={fileState.objectUrl}
            hlsUrl={hlsUrl}
            handleRemoveFile={handleRemoveFile}
            isDeleting={fileState.isDeleting}
            fileType={fileTypeAccepted}
            isSpriteGenerated={fileState.isSpriteGenerated || !!effectiveSpriteMetadata}
            spriteGenerating={fileState.spriteGenerating}
            spriteMetadata={effectiveSpriteMetadata}
            onDurationLoaded={(d) => {
              if (!fileState.duration) {
                console.log("Uploader: Auto-captured duration from player:", d);
                setFileState(s => ({ ...s, duration: d }));
                onDurationChange?.(Math.round(d));
              }
            }}
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
        "relative border-2 border-dashed transition-colors duration-200 ease-ini-out w-full h-72 md:h-[500px] rounded-lg",
        isDragActive
          ? "border-primary bg-primary/10 border-solid"
          : "border-border hover:border-primary"
      )}
    >
      <CardContent className="flex items-center justify-center h-full w-full p-4">
        <input {...getInputProps()} />
        {renderContent()}
      </CardContent>
    </Card>
  );
}
