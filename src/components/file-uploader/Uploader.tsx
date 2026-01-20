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
        //get presignedUrl

        const presignedResponse = await fetch("/api/s3/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            isImage: fileTypeAccepted === "image" ? true : false,
          }),
        });

        if (!presignedResponse.ok) {
          toast.error("Failed to get presigned URL");
          setFileState((prevState) => ({
            ...prevState,
            uploading: false,
            progress: 0,
            error: true,
          }));
          return;
        }

        const { presignedUrl, key } = await presignedResponse.json();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              setFileState((prevState) => ({
                ...prevState,
                progress: Math.round(progress),
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

              toast.success("File uploaded successfully");

              // Trigger HLS Processing if it's a video
              if (fileTypeAccepted === "video") {
                setFileState((prevState) => ({
                  ...prevState,
                  transcoding: true,
                  transcodingProgress: 0,
                }));

                console.log("[UPLOADER] Starting video processing for:", key);
                
                // Call the process API
                fetch("/api/video/process", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ videoKey: key }),
                })
                .then(res => {
                  console.log("[UPLOADER] Process API response received");
                  return res.json();
                })
                .catch(err => {
                  console.error("[UPLOADER] Process API error:", err);
                });

                // Poll for progress
                let pollCount = 0;
                const maxPolls = 1200; // 1200 * 3s = 1 hour

                const pollInterval = setInterval(async () => {
                  pollCount++;
                  if (pollCount > maxPolls) {
                    clearInterval(pollInterval);
                    setFileState((prevState) => ({ ...prevState, transcoding: false }));
                    return;
                  }

                  try {
                    const res = await fetch(`/api/video/status?videoKey=${key}`);
                    if (res.ok) {
                      const { progress, isComplete } = await res.json();
                      console.log(`[UPLOADER] Transcoding progress for ${key}: ${progress}%`);
                      
                      setFileState((prevState) => ({
                        ...prevState,
                        transcodingProgress: progress,
                      }));

                      if (isComplete) {
                        clearInterval(pollInterval);
                        setFileState((prevState) => ({
                          ...prevState,
                          transcoding: false,
                        }));
                        toast.success("Video processed and ready for streaming!");
                      }
                    }
                  } catch (error) {
                    console.error("Polling error:", error);
                  }
                }, 3000);

                // Cleanup interval on unmount
                return () => clearInterval(pollInterval);
              }

              resolve();
            } else {
              reject(new Error("File upload failed"));
            }
          };
          xhr.onerror = () => {
            reject(new Error("File upload failed"));
          };
          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      } catch {
        toast.error("Something went wrong");
        setFileState((prevState) => ({
          ...prevState,
          uploading: false,
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
    [fileState.objectUrl, uploadFile, fileTypeAccepted] // <-- FIX
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
