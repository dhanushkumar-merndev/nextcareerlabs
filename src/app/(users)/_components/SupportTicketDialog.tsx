/* This component is used to raise a support ticket */

"use client";
import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendNotificationAction, checkTicketLimitAction } from "@/app/data/notifications/actions";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { chatCache } from "@/lib/chat-cache";
import { TicketResponse } from "@/lib/types/components";

// Support ticket dialog component
export function SupportTicketDialog({ open, onOpenChange, courses = [], userId }: { open: boolean; onOpenChange: (open: boolean) => void; courses?: { id: string, title: string }[], userId?: string }) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const currentUserId = userId;
  const [courseId, setCourseId] = useState<string>("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [limitStatus, setLimitStatus] = useState<{ limitReached: boolean, count: number }>({ limitReached: false, count: 0 });
  const isLimitChecking = open && limitStatus.count === 0;
  // Check ticket limit when dialog opens
  useEffect(() => {
    let mounted = true;
    if (open) {
      checkTicketLimitAction().then(res => {
        if (mounted) setLimitStatus(res);
      });
    }
    return () => {
      mounted = false;
    };
  }, [open]);
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (limitStatus.limitReached) {
      toast.error("You have reached the maximum of 3 active tickets.");
      return;
    }
    if (title.trim().length < 5 || content.trim().length < 10){
      toast.error("Please fill in all fields with at least 5 characters for title and 10 characters for description.");
      return;
    }
    // Start transition for async operation
    const prefix = courseId === "app_related" ? "[APP]" : courseId === "general" ? "[GENERAL]" : "[COURSE]";
    const categoryName = courseId === "app_related" 
        ? "App Related Issue" 
        : courseId === "general" 
            ? "General Issue" 
            : courses.find(c => c.id === courseId)?.title || "Course Related";
    
    const formattedContent = `**Issue Type:** ${categoryName}\n**Summary:** ${title}\n\n**Description:**\n${content}`;
    const issueTitle = `${prefix} ${title}`;

    // 2. PREDICT THREAD ID AND DISPATCH INSTANT UPDATE
    if (currentUserId) {
        const predictedThreadId = `support_${currentUserId}`;
        
        // a. Update Sidebar Instantly with the new thread object
        window.dispatchEvent(new CustomEvent("chat-thread-update", {
          detail: {
            threadId: predictedThreadId,
            lastMessage: title,
            updatedAt: new Date().toISOString(),
            newThread: {
              threadId: predictedThreadId,
              display: {
                name: "Support",
                image: "" // Support default image
              },
              lastMessage: title,
              updatedAt: new Date().toISOString(),
              unreadCount: 0,
              type: "Support",
              resolved: false
            }
          }
        }));

        // b. Seed the message cache so it's ready if they click it
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          content: formattedContent,
          senderId: currentUserId,
          createdAt: new Date().toISOString(),
          status: "sending",
          sender: { id: currentUserId, name: "You", image: "" },
          type: "SUPPORT_TICKET"
        };

        queryClient.setQueryData(["messages", predictedThreadId, currentUserId], {
          pages: [{ messages: [optimisticMessage], nextCursor: null }],
          pageParams: [undefined]
        });
    }

    const predictedThreadId = `support_${currentUserId}`; // Keep for background action scoping

    // INSTANT FEEDBACK
    toast.success("Ticket request sent! We will get back to you shortly.");
    onOpenChange(false);
    setTitle("");
    setContent("");

    // 3. BACKGROUND ACTION
    (async () => {
      try {
        const res: TicketResponse = await sendNotificationAction({
          title: issueTitle,
          content: formattedContent,
          type: "SUPPORT_TICKET",
          courseId: ["general", "app_related"].includes(courseId) ? undefined : courseId,
        });

        if (!res.success) {
          // Revert optimistic update on failure (sidebar will refetch automatically on next sync anyway)
          if (res.code === "TICKET_LIMIT_REACHED") {
            const mins = res.minutesLeft;
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            const timeStr = hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins} minutes`;
            toast.error(`Ticket limit reached. Try again in ${timeStr}!`);
          } else {
            toast.error("Failed to raise ticket. Please try again.");
          }
          queryClient.invalidateQueries({ queryKey: ["sidebarData", currentUserId] });
          return;
        }

        // 4. FINAL SYNC
        const finalThreadId = res.notification?.threadId || predictedThreadId;
        
        await queryClient.invalidateQueries({ 
          queryKey: ["sidebarData", currentUserId],
          refetchType: 'active' 
        });
        
        if (currentUserId) {
          chatCache.invalidate("sidebarData", currentUserId);
        }
        
        queryClient.invalidateQueries({ queryKey: ["messages", finalThreadId, currentUserId] });
        chatCache.invalidate(`messages_${finalThreadId}`, currentUserId);

      } catch (error) {
        toast.error("Failed to raise ticket. Please try again.");
        queryClient.invalidateQueries({ queryKey: ["sidebarData", currentUserId] });
      }
    })();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Dialog Content */}
      <DialogContent className="sm:max-w-[500px]">
        {/* Dialog Header */}
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MessageSquarePlus className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Raise a Support Ticket</DialogTitle>
          {/* Dialog Description */}
          <DialogDescription className="text-center">
            Having trouble? Describe your issue and we'll help you out.
          </DialogDescription>
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-[10px] font-medium text-center">
            Please mention all the required details and information. Cannot be modified once submitted.
          </div>
          {limitStatus.limitReached && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs font-medium text-center">
              Limit Reached: You have 3 active tickets. Please wait for them to be resolved before raising new ones.
            </div>
          )}
        </DialogHeader>
        {/* Dialog Form */}
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
          {/* Dialog Form Input */}
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
          {/* Dialog Form Input */}
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
          {/* Dialog Footer */}
          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            {/* Dialog Submit Button */}
            <Button type="submit" disabled={isPending || limitStatus.limitReached }>
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
