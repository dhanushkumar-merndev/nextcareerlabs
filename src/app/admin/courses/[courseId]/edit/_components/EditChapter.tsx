"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tryCatch } from "@/hooks/try-catch";
import { Pencil, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { editChapter } from "../actions";

export function EditChapter({
  chapterId,
  initialName,
  courseId,
  onSuccess,
}: {
  chapterId: string;
  initialName: string;
  courseId: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  async function handleUpdate() {
    if (!name.trim()) {
      toast.error("Chapter name cannot be empty.");
      return;
    }

    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        editChapter({ chapterId, courseId, name })
      );

      if (error) {
        toast.error("Failed to update chapter. Please try again.");
        return;
      }

      if (result.status === "success") {
        toast.success(result.message);
        onSuccess?.();
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Chapter Name</DialogTitle>
          <DialogDescription>
            Update the name of this chapter. This action is reversible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter chapter name"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>

          <Button onClick={handleUpdate} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-1 size-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
