import { cn } from "@/lib/utils";
import { CloudUploadIcon, ImageIcon } from "lucide-react";
import { Button } from "../ui/button";

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
