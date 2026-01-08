"use client";

import { useState, useTransition, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { sendNotificationAction, checkTicketLimitAction } from "@/app/data/notifications/actions";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";

export function SupportTicketDialog({ 
  open, 
  onOpenChange,
  courses = [] 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  courses?: { id: string, title: string }[]
}) {
  const [isPending, startTransition] = useTransition();
  const [courseId, setCourseId] = useState<string>("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [limitStatus, setLimitStatus] = useState<{ limitReached: boolean, count: number }>({ limitReached: false, count: 0 });

  useEffect(() => {
    if (open) {
      checkTicketLimitAction().then(setLimitStatus);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (limitStatus.limitReached) {
      toast.error("You have reached the maximum of 3 active tickets.");
      return;
    }
    if (!title || !content) {
      toast.error("Please fill in all fields");
      return;
    }

    startTransition(async () => {
      try {
        const prefix = courseId === "app_related" ? "[APP]" : courseId === "general" ? "[GENERAL]" : "[COURSE]";
        
        // Find category name for the message body
        const categoryName = courseId === "app_related" 
            ? "App Related Issue" 
            : courseId === "general" 
                ? "General Issue" 
                : courses.find(c => c.id === courseId)?.title || "Course Related";

        const formattedContent = `**Issue Type:** ${categoryName}\n**Summary:** ${title}\n\n**Description:**\n${content}`;

        const res = await sendNotificationAction({
          title: `${prefix} ${title}`,
          content: formattedContent,
          type: "SUPPORT_TICKET",
          courseId: ["general", "app_related"].includes(courseId) ? undefined : courseId,
        });

        if (res && !res.success) {
            if ((res as any).error === "TICKET_LIMIT_REACHED") {
                const mins = (res as any).minutesLeft;
                const hours = Math.floor(mins / 60);
                const remainingMins = mins % 60;
                const timeStr = hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins} minutes`;
                toast.error(`Limit reached. Try again in ${timeStr}!`);
            } else {
                toast.error("Failed to raise ticket. Please try again.");
            }
            return;
        }

        toast.success("Ticket raised successfully! Our team will get back to you.");
        onOpenChange(false);
        setTitle("");
        setContent("");
      } catch (error) {
        toast.error("Failed to raise ticket. Please try again.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MessageSquarePlus className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Raise a Support Ticket</DialogTitle>
          <DialogDescription className="text-center">
            Having trouble? Describe your issue and we'll help you out.
          </DialogDescription>
          {limitStatus.limitReached && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs font-medium text-center">
              Limit Reached: You have 3 active tickets. Please wait for them to be resolved before raising new ones.
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category">Related to</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Issue</SelectItem>
                <SelectItem value="app_related">App Related Issue</SelectItem>
                {courses.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Issue Summary</Label>
            <Input 
              id="title" 
              placeholder="e.g., Cannot access MERN stack course" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Description</Label>
            <Textarea 
              id="content" 
              placeholder="Please provide as much detail as possible..." 
              className="min-h-[120px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || limitStatus.limitReached}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Submit Ticket"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
