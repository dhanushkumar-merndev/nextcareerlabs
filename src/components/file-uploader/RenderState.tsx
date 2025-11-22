import { cn } from "@/lib/utils";
import { CloudUploadIcon, ImageIcon, Loader2, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import Image from "next/image";
import CircularProgressColorDemo from "@/components/ui/progress-10";
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
}: {
  previewUrl: string;
  isDeleting: boolean;
  handleRemoveFile: () => void;
  fileType: "image" | "video";
}) {
  return (
    <div className="relative group w-full h-full flex items-center justify-center">
      {fileType === "video" ? (
        <video src={previewUrl} controls className="rounded-md w-full h-full" />
      ) : (
        <div className="relative w-full h-full">
          <Image
            src={previewUrl}
            alt="Upload File"
            fill
            className="object-contain p-2"
            sizes="300px"
          />
        </div>
      )}
      <Button
        variant={"destructive"}
        size="icon"
        className={cn("absolute top-4 right-4 cursor-pointer")}
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
}: {
  progress: number;
  file: File;
}) {
  return (
    <div className="text-center flex justify-center items-center flex-col">
      <CircularProgressColorDemo progress={progress} />
      <p className="mt-2 text-sm font-medium text-foreground">Uploading...</p>
      <p className="mt-1 text-xs text-muted-foreground truncate max-w-xs">
        {file.name}
      </p>
    </div>
  );
}
