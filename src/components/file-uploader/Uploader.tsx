"use client";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { transcodeToHLS } from "@/lib/client-video-processor";

interface iAppProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  fileTypeAccepted: "image" | "video";
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
}

export function Uploader({ onChange, value, fileTypeAccepted }: iAppProps) {
  const fileUrl = useConstructUrl(value || "");
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
  });

  const uploadFile = useCallback(
    async (file: File) => {
      setFileState((prevState) => ({
        ...prevState,
        uploading: true,
        progress: 0,
      }));

      try {
        if (fileTypeAccepted === "video") {
          // 1. Transcode locally on client
          setFileState((s) => ({
            ...s,
            transcoding: true,
            transcodingProgress: 0,
          }));
          const { m3u8, segments } = await transcodeToHLS(file, (p) => {
            setFileState((s) => ({ ...s, transcodingProgress: p }));
          });
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
          await fetch(m3u8Data.presignedUrl, {
            method: "PUT",
            body: m3u8,
            headers: { "Content-Type": "application/x-mpegURL" },
          });

          // 4. Upload Segments (Parallel with Concurrency Control)
          let uploadedSegments = 0;
          const CONCURRENCY_LIMIT = 10;
          
          for (let i = 0; i < segments.length; i += CONCURRENCY_LIMIT) {
            const batch = segments.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(
              batch.map(async (segment, indexInBatch) => {
                const globalIndex = i + indexInBatch;
                const { presignedUrl } = presignedUrls[globalIndex + 1]; // +1 because master was at 0
                
                await fetch(presignedUrl, {
                  method: "PUT",
                  body: segment.blob,
                  headers: { "Content-Type": "video/MP2T" },
                });
                
                uploadedSegments++;
                setFileState((s) => ({
                  ...s,
                  progress: Math.round((uploadedSegments / segments.length) * 100),
                }));
              })
            );
          }

          const finalKey = `${baseKey}.${file.name.split(".").pop()}`;
          setFileState((prevState) => ({
            ...prevState,
            uploading: false,
            progress: 100,
            key: finalKey,
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
    if (fileState.uploading || fileState.transcoding) {
      return (
        <RenderUploadingState
          progress={fileState.transcoding ? fileState.transcodingProgress : fileState.progress}
          file={fileState.file}
          label={fileState.transcoding ? "Optimizing for streaming..." : "Uploading..."}
        />
      );
    }
    if (fileState.error) {
      return <RenderErrorState />;
    }
    if (fileState.objectUrl) {
      if (fileState.isDeleting) {
        return (
          <div className="flex flex-col items-center justify-center space-y-4 w-full h-full">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium animate-pulse">Removing from storage...</p>
          </div>
        );
      }
      // Use HLS only for existing videos from the DB. 
      // For fresh uploads, stick to the local blob URL to avoid 404s during storage sync.
      const isExistingVideo = !fileState.file;
      const hlsKey = (isExistingVideo && fileState.key) ? `hls/${fileState.key.replace(/\.[^/.]+$/, "")}/master.m3u8` : undefined;
      const hlsUrl = hlsKey ? useConstructUrl(hlsKey) : undefined;

      return (
        <RenderUploadedState
          previewUrl={fileState.objectUrl}
          hlsUrl={hlsUrl}
          handleRemoveFile={handleRemoveFile}
          isDeleting={fileState.isDeleting}
          fileType={fileTypeAccepted}
        />
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
        {renderContent()}
      </CardContent>
    </Card>
  );
}
