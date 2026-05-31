"use client";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
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
import { constructUrl } from "@/hooks/use-construct-url";
import {
  MAX_BROWSER_TRANSCODE_SIZE_BYTES,
  MAX_BROWSER_TRANSCODE_SIZE_LABEL,
  transcodeToHLS,
  compressAudio,
} from "@/lib/client-video-processor";
import type { ProcessingProgressInfo } from "@/lib/client-video-processor";
import { validateMp4ForFastHls } from "@/lib/mp4-upload-validation";
import { Loader2 } from "lucide-react";
import { SpriteGenerator } from "@/lib/video/sprite-generator";


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

function formatProcessTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getAudioProgressLabel(
  progress: number,
  info: ProcessingProgressInfo | undefined,
  duration: number,
) {
  const audioProgress = Math.max(
    1,
    Math.min(100, Math.round(((progress - 70) / 25) * 100)),
  );
  const totalSeconds = info?.totalSeconds || Math.round(duration || 0);
  const processedSeconds = info?.processedSeconds ?? Math.floor((audioProgress / 100) * totalSeconds);

  if (totalSeconds > 0) {
    return `Compressing audio... ${formatProcessTime(processedSeconds)} / ${formatProcessTime(totalSeconds)}`;
  }

  return `Compressing audio... ${audioProgress}%`;
}

export interface SpriteMetadata {
  spriteKey: string;
  spriteCols?: number;
  spriteRows?: number;
  spriteInterval?: number;
  spriteWidth?: number;
  spriteHeight?: number;
  lowResKey?: string;
}

interface VideoUploadMetadata {
  videoEncryptionKey?: string | null;
  videoEncryptionIV?: string | null;
}

interface iAppProps {
  value?: string | null;
  onChange: (value: string | null, metadata?: VideoUploadMetadata) => void;
  onDurationChange?: (duration: number) => void;
  onSpriteChange?: (sprite: SpriteMetadata) => void;
  fileTypeAccepted: "image" | "video";
  duration?: number;
  initialSpriteKey?: string | null;
  captionUrl?: string | null;
  lessonId?: string;
  onEncryptionChange?: (key: string, iv: string) => void;
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
  transcodeStatus?: string;
  spriteGenerating: boolean;
  spriteStatus?: string;
  spriteUploadProgress: number;
  uploadStatus?: string;
  isSpriteGenerated?: boolean;
  baseKey?: string | null;
  duration?: number;
  spriteMetadata?: SpriteMetadata;
  audioCompressing: boolean;
}

function getBaseKey(key?: string | null) {
  if (!key) return null;
  if (key.startsWith("hls/")) return key.split("/")[1] ?? null;
  return key.replace(/\.[^/.]+$/, "");
}

function getHlsPlaylistUrl(id: string, baseKey: string) {
  const params = new URLSearchParams({ v: baseKey });
  return `/api/video/playlist/${id}?${params.toString()}`;
}

async function isHlsPlayable(playlistUrl: string) {
  const playlistResponse = await fetch(playlistUrl, { cache: "no-store" });
  if (!playlistResponse.ok) return false;

  const playlist = await playlistResponse.text();
  if (!playlist.includes("#EXTM3U")) return false;

  const keyUri = playlist.match(/#EXT-X-KEY[^\n]*URI="([^"]+)"/)?.[1];
  if (keyUri) {
    const keyResponse = await fetch(new URL(keyUri, window.location.href), {
      cache: "no-store",
    });
    if (!keyResponse.ok) return false;
  }

  const firstSegmentUri = playlist
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));

  if (!firstSegmentUri) return false;

  const segmentResponse = await fetch(
    new URL(firstSegmentUri, window.location.href),
    {
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    },
  );

  return segmentResponse.ok || segmentResponse.status === 206;
}

function setVideoProcessingFlag(value: boolean) {
  Reflect.set(window, "__PROCESSING_VIDEO__", value);
}

export function Uploader({ onChange, onDurationChange, onSpriteChange, onEncryptionChange, lessonId, value, fileTypeAccepted, duration: initialDuration, initialSpriteKey, captionUrl }: iAppProps) {
  const fileUrl = constructUrl(value || "");

  const extractedBaseKey = value ? (() => {
    if (value.startsWith('hls/')) return value.split('/')[1];
    return value.replace(/\.[^/.]+$/, "");
  })() : null;


  // ── Cancel Infrastructure ──
  const abortRef = useRef<AbortController>(new AbortController());
  const activeXHRs = useRef<Set<XMLHttpRequest>>(new Set());

  const handleCancelUpload = () => {
    // 1. Abort all async operations (fetch, timers etc.)
    abortRef.current.abort();

    // 2. Abort all in-flight XHR uploads
    activeXHRs.current.forEach(xhr => {
      try { xhr.abort(); } catch { }
    });
    activeXHRs.current.clear();

    // 3. Unlock processing flag
    setVideoProcessingFlag(false);

    // 4. Reset state to empty
    setHlsReady(false);
    setFileState(prev => {
      // Revoke blob URL if exists
      if (prev.objectUrl && prev.objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.objectUrl);
      }
      return {
        error: false,
        file: null,
        id: null,
        uploading: false,
        progress: 0,
        isDeleting: false,
        fileType: fileTypeAccepted,
        key: null,
        objectUrl: undefined,
        transcoding: false,
        transcodingProgress: 0,
        transcodeStatus: undefined,
        spriteGenerating: false,
        spriteUploadProgress: 0,
        uploadStatus: undefined,
        audioCompressing: false,
        baseKey: null,
      };
    });

    // 5. Create fresh AbortController for next upload
    abortRef.current = new AbortController();

    toast.info("Upload cancelled");
  };

  const justUploadedRef = useRef(false);
  const [hlsReady, setHlsReady] = useState(
    value ? !!lessonId : false
  );

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
    transcodeStatus: undefined,
    spriteGenerating: false,
    spriteUploadProgress: 0,
    uploadStatus: undefined,
    isSpriteGenerated: !!initialSpriteKey || !!extractedBaseKey,
    spriteMetadata: initialSpriteKey ? {
      spriteKey: initialSpriteKey
    } : (extractedBaseKey ? {
      spriteKey: `sprites/${extractedBaseKey}/thumbnails.vtt`
    } : undefined),
    baseKey: extractedBaseKey,
    duration: initialDuration,
    audioCompressing: false,
  });

  // Sync state when value prop changes (route changes, removals, or router.refresh).
  useEffect(() => {
    setFileState(prev => {
      if (value === prev.key && initialDuration === prev.duration) return prev;

      const nextBaseKey = getBaseKey(value);
      const nextSpriteMetadata = initialSpriteKey
        ? { spriteKey: initialSpriteKey }
        : nextBaseKey
          ? { spriteKey: `sprites/${nextBaseKey}/thumbnails.vtt` }
          : undefined;

      if (prev.objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(prev.objectUrl);
      }

      return {
        ...prev,
        file: null,
        key: value,
        objectUrl: value ? constructUrl(value) : undefined,
        baseKey: nextBaseKey,
        duration: initialDuration,
        isSpriteGenerated: !!nextSpriteMetadata,
        spriteMetadata: nextSpriteMetadata,
        error: false,
        isDeleting: false,
        uploading: false,
        progress: 0,
        transcoding: false,
        transcodingProgress: 0,
        transcodeStatus: undefined,
        spriteGenerating: false,
        spriteUploadProgress: 0,
        uploadStatus: undefined,
        audioCompressing: false,
      };
    });
  }, [initialDuration, initialSpriteKey, value]);

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

  // After upload, poll until HLS playlist is confirmed available (DB save completed)
  useEffect(() => {
    if (!fileState.baseKey || !lessonId || fileState.uploading || fileState.file) {
      return;
    }

    const baseKey = fileState.baseKey;

    if (justUploadedRef.current) {
      justUploadedRef.current = false;
      let cancelled = false;
      const playlistUrl = getHlsPlaylistUrl(lessonId, baseKey);
      const poll = async () => {
        while (!cancelled) {
          try {
            if (await isHlsPlayable(playlistUrl)) {
              if (!cancelled) setHlsReady(true);
              return;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 800));
        }
      };
      poll();
      return () => { cancelled = true; };
    } else {
      setHlsReady(true);
    }
  }, [fileState.baseKey, lessonId, fileState.uploading, fileState.file]);

  const uploadFile = async (file: File) => {
      // Capture the signal NOW so it stays aborted even after handleCancelUpload
      // replaces abortRef.current with a fresh controller.
      const signal = abortRef.current.signal;
      const isCancelled = () => signal.aborted;

      if (fileTypeAccepted === "video") {
        setHlsReady(false);
      }

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
            transcodeStatus: "Checking video compatibility...",
          }));

          const compatibility = await validateMp4ForFastHls(file);
          if (!compatibility.valid) {
            toast.error(compatibility.reason || "Invalid video. Please upload H.264 video with AAC audio.");
            setFileState((s) => ({
              ...s,
              error: true,
              uploading: false,
              transcoding: false,
              uploadStatus: "Upload failed",
            }));
            return;
          }

          console.log("[Uploader] Fast HLS compatibility OK", {
            videoCodec: compatibility.videoCodec,
            audioCodec: compatibility.audioCodec,
          });

          setFileState((s) => ({
            ...s,
            transcodeStatus: "Reading video...",
          }));

          const duration = await getVideoDuration(file);
          if (isCancelled()) return;
          onDurationChange?.(Math.round(duration));

          // LOCK: Start Memory-Intensive Phase
          setVideoProcessingFlag(true);

          // Combined HLS transcode + audio compression in a single FFmpeg session
          let encryptionMetadata = null;
          if (lessonId) {
            const key = window.crypto.getRandomValues(new Uint8Array(16));
            // Convert to base64 immediately while buffer is fresh
            // Use Array.from to avoid "detached buffer" when spreading TypedArray later
            const keyBase64 = btoa(String.fromCharCode.apply(null, Array.from(key)));

            const iv = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

            const keyUrl = `${window.location.origin}/api/video/key/${lessonId}`;

            encryptionMetadata = { key, keyBase64, iv, keyUrl };
            console.log("[Uploader] Encryption metadata generated", { iv, keyUrl });
          }

          const { m3u8, segments, audioBlob: transcodedAudio } = await transcodeToHLS(file, (p, info) => {
            const transcodeStatus =
              p >= 70 && p < 100
                ? getAudioProgressLabel(p, info, duration)
                : p >= 100
                  ? "Video prepared"
                  : "Preparing video stream and audio...";
            setFileState((s) => ({ ...s, transcodingProgress: p, transcodeStatus }));
          }, duration, encryptionMetadata ? {
            key: encryptionMetadata.key,
            iv: encryptionMetadata.iv,
            keyUrl: encryptionMetadata.keyUrl
          } : undefined);
          if (isCancelled()) return;
          setFileState((s) => ({ ...s, transcoding: false, transcodeStatus: undefined }));

          // Use audio from combined session; fallback to standalone only if needed
          let audioBlob: Blob | null = transcodedAudio;
          if (!audioBlob) {
            setFileState((s) => ({
              ...s,
              audioCompressing: true,
              transcodingProgress: 1,
              transcodeStatus: "Compressing audio... 1%",
            }));
            try {
              audioBlob = await compressAudio(file, (p, info) => {
                const processedSeconds =
                  info?.processedSeconds ?? Math.floor((p / 100) * duration);
                setFileState(s => ({
                  ...s,
                  transcodingProgress: p,
                  transcodeStatus: `Compressing audio... ${formatProcessTime(processedSeconds)} / ${formatProcessTime(duration)}`,
                }));
              }, duration);
            } catch (audioErr) {
              console.error("Audio compression fallback failed:", audioErr);
            }
            if (isCancelled()) return;
            setFileState((s) => ({ ...s, audioCompressing: false }));
          }
          if (audioBlob) {
            console.log(`Uploader: Compressed audio: ${(audioBlob.size / 1024).toFixed(0)}KB`);
          }

          // 1.5 Generate Sprites (New Auto Step)
          setFileState((s) => ({
            ...s,
            spriteGenerating: true,
            spriteUploadProgress: 1,
            spriteStatus: "Preparing thumbnails...",
          }));
          toast.info("Generating thumbnails...");

          let spriteResult: { combinedBlob: Blob | null; vttBlob: Blob | null; previewLowBlob?: Blob; spriteFileName: string } | null = null;
          try {
            // Dynamic Interval based on duration for premium experience
            let interval = 10;
            if (duration < 300) interval = 1;      // 1s for short videos (< 5 min)
            else if (duration < 1200) interval = 2; // 2s for medium (< 20 min)
            else if (duration < 3600) interval = 5; // 5s for long (< 60 min)

            console.log(`Uploader: Generating thumbnails with ${interval}s interval for ${duration}s video`);

            // 240x135, dynamic interval, 10 columns
            const generator = new SpriteGenerator(320, 180, interval, 10);
            spriteResult = await generator.generate(file, (progress, status) => {
              setFileState(s => ({ ...s, spriteUploadProgress: progress, spriteStatus: status }));
            });
          } catch (spriteError) {
            console.error("Auto sprite generation failed:", spriteError);
            toast.error("Thumbnail generation failed, but video will still upload.");
          }

          if (isCancelled()) return;

          // 2. Prepare for upload
          setFileState((s) => ({ ...s, uploading: true, spriteGenerating: false, uploadStatus: "Getting upload URLs..." }));
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
              label: "playlist",

            },
            ...segments.map((segment) => ({
              fileName: `hls/${baseKey}/${segment.name}`,
              contentType: "video/MP2T",
              size: segment.blob.size,
              isImage: false,
              isKeyDirect: true,
              customKey: `hls/${baseKey}/${segment.name}`,
              label: "video stream",

            })),
          ];

          // Add compressed audio to upload request
          if (audioBlob) {
            uploadRequests.push({
              fileName: `hls/${baseKey}/audio.ogg`,
              contentType: "audio/ogg",
              size: audioBlob.size,
              isImage: false,
              isKeyDirect: true,
              customKey: `hls/${baseKey}/audio.ogg`,
              label: "audio",

            });
          }



          // Add Consolidated Sprites to Upload Request if generated
          let vttKey: string | null = null;
          if (spriteResult) {
            // Binary file containing ALL sheets (stripes)
            uploadRequests.push({
              fileName: spriteResult.spriteFileName,
              contentType: "application/octet-stream",
              size: spriteResult.combinedBlob!.size,
              isImage: false,
              isKeyDirect: true,
              customKey: `sprites/${baseKey}/${spriteResult.spriteFileName}`,
              label: "preview sprites",

            });

            // VTT
            vttKey = `sprites/${baseKey}/thumbnails.vtt`;
            uploadRequests.push({
              fileName: "thumbnails.vtt",
              contentType: "text/vtt",
              size: spriteResult.vttBlob!.size,
              isImage: false,
              isKeyDirect: true,
              customKey: vttKey,
              label: "thumbnail timeline",

            });

            // Low-Res Preview
            if (spriteResult.previewLowBlob) {
              uploadRequests.push({
                fileName: "preview_low.jpg",
                contentType: "image/jpeg",
                size: spriteResult.previewLowBlob.size,
                isImage: false,
                isKeyDirect: true,
                customKey: `sprites/${baseKey}/preview_low.jpg`,
                label: "preview image",

              });
            }
          }

          if (isCancelled()) return;

          // Batch request all pre-signed URLs at once
          const presignedRes = await fetch("/api/s3/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uploadRequests),
            signal,
          });

          if (!presignedRes.ok) {
            toast.error("Failed to get pre-signed URLs");
            setFileState((s) => ({
              ...s,
              error: true,
              uploading: false,
              uploadStatus: "Upload failed",
            }));
            return;
          }
          const presignedUrls: { presignedUrl: string; key: string }[] = await presignedRes.json();

          // 3. Upload Master Playlist (index 0)
          const m3u8Data = presignedUrls[0];
          setFileState((s) => ({ ...s, uploadStatus: "Uploading playlist..." }));
          await fetch(m3u8Data.presignedUrl, {
            method: "PUT",
            body: m3u8,
            headers: { "Content-Type": "application/x-mpegURL" },
          });

          // 4. Upload everything else (Segments, Audio, Sprites)
          const totalBytes = uploadRequests.reduce((acc, req) => acc + (req.size || 0), 0);
          const loadedBytes = new Array(uploadRequests.length).fill(0);

          // The master playlist (index 0) is already uploaded, mark it as full size
          loadedBytes[0] = uploadRequests[0].size;

          const uploadFileToS3 = async (index: number, blob: Blob, contentType: string) => {
            if (isCancelled()) return;
            const { presignedUrl } = presignedUrls[index];
            const label = uploadRequests[index]?.label ?? "file";
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              activeXHRs.current.add(xhr);

              const updateProgress = () => {
                const currentTotalLoaded = loadedBytes.reduce((a, b) => a + b, 0);
                const globalProgress = Math.min(100, Math.round((currentTotalLoaded / totalBytes) * 100));
                setFileState((s) => ({ ...s, progress: globalProgress, uploadStatus: `Uploading ${label}...` }));
              };

              // Real-time byte tracking
              if (xhr.upload) {
                xhr.upload.onprogress = (e) => {
                  if (e.lengthComputable) {
                    loadedBytes[index] = e.loaded;
                    updateProgress();
                  }
                };
              }

              xhr.onload = () => {
                activeXHRs.current.delete(xhr);
                if (xhr.status >= 200 && xhr.status < 300) {
                  loadedBytes[index] = blob.size;
                  updateProgress(); // Ensure 100% contribution of this chunk is reflected
                  resolve();
                }
                else reject(new Error(`Status ${xhr.status}`));
              };
              xhr.onerror = () => {
                activeXHRs.current.delete(xhr);
                reject(new Error("Network error"));
              };
              xhr.onabort = () => {
                activeXHRs.current.delete(xhr);
                reject(new Error("Upload cancelled"));
              };
              xhr.open("PUT", presignedUrl);
              xhr.setRequestHeader("Content-Type", contentType);
              xhr.send(blob);
            });
          };

          // Build queue
          const uploadQueue: (() => Promise<void>)[] = [];

          // Segments start at index 1
          segments.forEach((segment, i) => {
            uploadQueue.push(() => uploadFileToS3(i + 1, segment.blob, "video/MP2T"));
          });

          let currentIndex = 1 + segments.length;

          // Audio
          if (audioBlob) {
            const audioIdx = currentIndex++;
            uploadQueue.push(() => uploadFileToS3(audioIdx, audioBlob!, "audio/ogg"));
          }


          // Sprites
          if (spriteResult) {
            const binaryIdx = currentIndex++;
            uploadQueue.push(() => uploadFileToS3(binaryIdx, spriteResult!.combinedBlob!, "application/octet-stream"));

            const vttIdx = currentIndex++;
            uploadQueue.push(() => uploadFileToS3(vttIdx, spriteResult!.vttBlob!, "text/vtt"));

            if (spriteResult.previewLowBlob) {
              const lowIdx = currentIndex++;
              uploadQueue.push(() => uploadFileToS3(lowIdx, spriteResult!.previewLowBlob!, "image/jpeg"));
            }
          }

          // Execute all in parallel (browser will throttle automatically)
          await Promise.all(uploadQueue.map(t => t()));
          setFileState((s) => ({ ...s, uploadStatus: "Finalizing upload..." }));

          // Cleanup HLS blobs from memory
          segments.length = 0;
          spriteResult = null;


          const finalKey = `hls/${baseKey}/master.m3u8`;

          // Update Metadata if sprites were generated
          if (vttKey) {
            const metadata: SpriteMetadata = {
              spriteKey: vttKey,
              lowResKey: `sprites/${baseKey}/preview_low.jpg`,
            };
            onSpriteChange?.(metadata);
            setFileState(s => ({ ...s, isSpriteGenerated: true, spriteMetadata: metadata }));
          }

          // Update Encryption in DB if generated
          if (encryptionMetadata) {
            onEncryptionChange?.(encryptionMetadata.keyBase64, encryptionMetadata.iv);
          }

          setFileState((prevState) => ({
            ...prevState,
            uploading: false,
            progress: 100,
            key: finalKey,
            baseKey: baseKey,
            duration: duration,
            file: null, // Release the File object from memory (can be hundreds of MB)
            uploadStatus: undefined,
          }));
          justUploadedRef.current = true;
          onChange?.(finalKey, encryptionMetadata ? {
            videoEncryptionKey: encryptionMetadata.keyBase64,
            videoEncryptionIV: encryptionMetadata.iv,
          } : undefined);
          toast.success("Video processed and uploaded successfully");
          // UNLOCK: Finished Memory-Intensive Phase
          setVideoProcessingFlag(false);

          // Cleanup HLS blobs from memory
          segments.length = 0;
          spriteResult = null;

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

          if (!presignedResponse.ok) {
            toast.error("Failed to get presigned URL");
            setFileState((s) => ({
              ...s,
              error: true,
              uploading: false,
              uploadStatus: "Upload failed",
            }));
            return;
          }
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
        const uploadErr = error as Error | null;
        // Don't show error toast if it was a user-initiated cancel
        if (isCancelled() || uploadErr?.message === "Upload cancelled" || uploadErr?.name === "AbortError") return;
        toast.error(uploadErr?.message || "Something went wrong during upload");
        setVideoProcessingFlag(false);
        setFileState((prevState) => {
          if (prevState.objectUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(prevState.objectUrl);
          }
          return {
            ...prevState,
            uploading: false,
            transcoding: false,
            audioCompressing: false,
            spriteGenerating: false,
            transcodeStatus: undefined,
            uploadStatus: undefined,
            progress: 0,
            error: true,
            objectUrl: undefined,
            file: null,
          };
        });
      }
  };


  const onDrop = (acceptedFiles: File[]) => {
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
          transcodeStatus: undefined,
          spriteGenerating: false,
          spriteStatus: undefined,
          spriteUploadProgress: 0,
          uploadStatus: undefined,
          audioCompressing: false,

        });

        uploadFile(file);
      }
  };

  async function handleRemoveFile() {
    if (fileState.isDeleting || !fileState.objectUrl) return;
    try {
      setHlsReady(false);
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
        transcodeStatus: undefined,
        spriteGenerating: false,
        spriteUploadProgress: 0,
        uploadStatus: undefined,
        audioExtracting: false,
        audioProgress: 0,
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
        toast.error(
          `The file exceeds the maximum size of ${
            fileTypeAccepted === "video" ? MAX_BROWSER_TRANSCODE_SIZE_LABEL : "5MB"
          }.`,
        );
      }
    }
  }

  function renderContent() {
    // 1. If currently uploading or transcoding the MAIN video, show full-screen progress
    if (fileState.uploading || fileState.transcoding || fileState.audioCompressing || fileState.spriteGenerating) {
      let label = "Uploading...";
      let progress = fileState.progress;

      if (fileState.transcoding) {
        label = fileState.transcodeStatus || "Preparing video for streaming...";
        progress = fileState.transcodingProgress;
      }
      else if (fileState.audioCompressing) {
        label = fileState.transcodeStatus || "Compressing audio...";
        progress = fileState.transcodingProgress;
      }
      else if (fileState.spriteGenerating) {
        label = fileState.spriteStatus || "Generating snappy thumbnails...";
        progress = fileState.spriteUploadProgress;
      } else if (fileState.uploading) {
        label = fileState.uploadStatus || label;
      }

      return (
        <RenderUploadingState
          progress={progress}
          file={fileState.file}
          label={label}
          onCancel={handleCancelUpload}
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
      const hlsUrl = (isExistingVideo && lessonId && fileState.baseKey && hlsReady)
        ? getHlsPlaylistUrl(lessonId, fileState.baseKey)
        : undefined;

      // Show loading while waiting for HLS playlist to become available (DB save in progress)
      if (isExistingVideo && lessonId && fileState.baseKey && !hlsReady) {
        return <RenderUploadingState progress={100} label="Preparing video for playback..." />;
      }

      // Reactive Sprite Metadata: Use state if available (new upload), otherwise derive from key (existing)
      const effectiveSpriteMetadata = fileState.spriteMetadata || (extractedBaseKey ? {
        spriteKey: `sprites/${extractedBaseKey}/thumbnails.vtt`
      } : undefined);

      return (
        <div className="w-full">
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
            captionUrl={captionUrl || undefined}
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
      fileTypeAccepted === "video" ? MAX_BROWSER_TRANSCODE_SIZE_BYTES : 5 * 1024 * 1024,
    onDropRejected: rejectedFiles,
    disabled: fileState.uploading || !!fileState.objectUrl || fileState.transcoding || fileState.spriteGenerating,
  });
  return (
    <Card
      {...getRootProps()}
      className={cn(
        "relative border-2 border-dashed transition-colors duration-200 w-full rounded-lg", isDragActive
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
