"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface BackConfirmProps {
  href: string;
  isDirty?: boolean;
  message?: string;
  description?: string;
}

export function BackConfirm({
  href,
  isDirty = true,
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
      router.push(href);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "cursor-pointer border border-border mr-2"
        )}
      >
        <ArrowLeft className="size-4" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{message}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOpen(false)}>
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction onClick={handleContinue}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
