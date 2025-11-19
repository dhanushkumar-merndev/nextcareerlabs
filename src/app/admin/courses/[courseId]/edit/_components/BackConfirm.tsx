"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants, Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BackConfirmProps {
  href: string;
  isDirty?: boolean; // ⬅ NEW
  message?: string;
  description?: string;
}

export function BackConfirm({
  href,
  isDirty = true, // default: show dialog
  message = "Leave this page?",
  description = "You may have unsaved changes. Are you sure you want to go back?",
}: BackConfirmProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleContinue() {
    router.push(href);
  }

  function handleClick() {
    if (!isDirty) {
      // ⬅ IF DATA NOT MODIFIED → GO BACK DIRECTLY
      router.push(href);
      return;
    }

    // ELSE SHOW DIALOG
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "cursor-pointer border border-border mr-2" // ← prevents layout shift + enables pointer
        )}
      >
        <ArrowLeft className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{message}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleContinue}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
