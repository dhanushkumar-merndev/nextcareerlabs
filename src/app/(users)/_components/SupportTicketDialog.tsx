/* This component is used to raise a support ticket */

"use client";
import { useState, useTransition, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  SelectValue,
} from "@/components/ui/select";
import {
  sendNotificationAction,
  checkTicketLimitAction,
} from "@/app/data/notifications/actions";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { chatCache, getSidebarKey, getSidebarLocalKey } from "@/lib/chat-cache";
import { TicketResponse } from "@/lib/types/components";

// Support ticket dialog component
export function SupportTicketDialog({
  open,
  onOpenChange,
  courses = [],
  userId,
  initialCategory,
  initialTitle,
  courseName,
  lessonName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses?: { id: string; title: string }[];
  userId?: string;
  initialCategory?: string;
  initialTitle?: string;
  courseName?: string;
  lessonName?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const currentUserId = userId;
  const [courseId, setCourseId] = useState<string>(
    initialCategory || "general",
  );
  const [title, setTitle] = useState(initialTitle || "");
  const [content, setContent] = useState("");

  const isLessonSpecific = !!(courseName || lessonName);

  const placeholderMap: Record<string, string> = {
    general:
      "Tell us what you're looking for or any general questions about your account...",
    app_related:
      "Are you facing issues with the website layout, buttons, or dashboard features? Please describe...",
    fault:
      "What happened? Please provide steps to reproduce the bug so we can fix it quickly...",
    error:
      "What error message did you see? If possible, mention when it occurs (e.g., during payment, during video play)...",
    improve:
      "How can we make your experience better? We'd love to hear your ideas!",
  };

  const summaryPlaceholderMap: Record<string, string> = {
    general: "e.g., Question about my subscription",
    app_related: "e.g., Sidebar not opening on mobile",
    fault: "e.g., Video stuck at 10:05",
    error: "e.g., Received 404 error on dashboard",
    improve: "e.g., Suggested feature for progress tracking",
  };

  const categoryNameMap: Record<string, string> = {
    app_related: "App Related Issue",
    general: "General Issue",
    fault: "Fault/Bug Report",
    error: "Error/Technical Issue",
    improve: "Improvement Suggestion",
  };

  const categoryName =
    categoryNameMap[courseId] ||
    courses.find((c) => c.id === courseId)?.title ||
    "Course Related";

  const prefixMap: Record<string, string> = {
    app_related: "[APP]",
    general: "[GENERAL]",
    fault: "[FAULT]",
    error: "[ERROR]",
    improve: "[IMPROVE]",
  };

  const prefix = prefixMap[courseId] || "[COURSE]";

  const currentPlaceholder =
    placeholderMap[courseId] ||
    `Please describe your question or issue regarding "${categoryName}" in detail...`;

  const currentSummaryPlaceholder =
    summaryPlaceholderMap[courseId] ||
    `Summary of issue regarding ${categoryName}...`;

  useEffect(() => {
    if (open) {
      if (initialCategory) setCourseId(initialCategory);
      if (initialTitle) setTitle(initialTitle);
    }
  }, [open, initialCategory, initialTitle]);
  const [limitStatus, setLimitStatus] = useState<{
    limitReached: boolean;
    count: number;
  }>({ limitReached: false, count: 0 });
  const isLimitChecking = open && limitStatus.count === 0;
  // Check ticket limit when dialog opens
  useEffect(() => {
    let mounted = true;
    if (open) {
      checkTicketLimitAction().then((res) => {
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
    if (title.trim().length < 5 || content.trim().length < 10) {
      toast.error(
        "Please fill in all fields with at least 5 characters for title and 10 characters for description.",
      );
      return;
    }
    const finalSummary = isLessonSpecific
      ? `${lessonName} (${courseName}) — ${title}`
      : title;

    const formattedContent = `**Issue Type:** ${categoryName}\n**Summary:** ${finalSummary}\n\n**Description:**\n${content}`;
    const issueTitle = `${prefix} ${finalSummary}`;

    // 2. PREDICT THREAD ID AND DISPATCH INSTANT UPDATE
    if (currentUserId) {
      const predictedThreadId = `support_${currentUserId}`;

      // a. Update Sidebar Instantly with the new thread object
      window.dispatchEvent(
        new CustomEvent("chat-thread-update", {
          detail: {
            threadId: predictedThreadId,
            lastMessage: finalSummary,
            updatedAt: new Date().toISOString(),
            newThread: {
              threadId: predictedThreadId,
              display: {
                name: "Support",
                image: "", // Support default image
              },
              lastMessage: finalSummary,
              updatedAt: new Date().toISOString(),
              unreadCount: 0,
              type: "Support",
              resolved: false,
            },
          },
        }),
      );

      // b. Seed the message cache so it's ready if they click it
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        content: formattedContent,
        senderId: currentUserId,
        createdAt: new Date().toISOString(),
        status: "sending",
        sender: { id: currentUserId, name: "You", image: "" },
        type: "SUPPORT_TICKET",
      };

      queryClient.setQueryData(["messages", predictedThreadId, currentUserId], {
        pages: [{ messages: [optimisticMessage], nextCursor: null }],
        pageParams: [undefined],
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
          courseId: [
            "general",
            "app_related",
            "fault",
            "error",
            "improve",
          ].includes(courseId)
            ? undefined
            : courseId,
        });

        if (!res.success) {
          // Revert optimistic update on failure (sidebar will refetch automatically on next sync anyway)
          if (res.code === "TICKET_LIMIT_REACHED") {
            const mins = res.minutesLeft;
            const hours = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            const timeStr =
              hours > 0
                ? `${hours}h ${remainingMins}m`
                : `${remainingMins} minutes`;
            toast.error(`Ticket limit reached. Try again in ${timeStr}!`);
          } else {
            toast.error("Failed to raise ticket. Please try again.");
          }
          queryClient.invalidateQueries({
            queryKey: getSidebarKey(currentUserId!, false),
          });
          return;
        }

        // 4. FINAL SYNC
        const finalThreadId = res.notification?.threadId || predictedThreadId;

        await queryClient.invalidateQueries({
          queryKey: getSidebarKey(currentUserId!, false),
          refetchType: "active",
        });

        if (currentUserId) {
          chatCache.invalidate(getSidebarLocalKey(false), currentUserId);
        }

        queryClient.invalidateQueries({
          queryKey: ["messages", finalThreadId, currentUserId],
        });
        chatCache.invalidate(`messages_${finalThreadId}`, currentUserId);

        // 5. DASHBOARD & RESOURCES INVALIDATION
        queryClient.invalidateQueries({
          queryKey: ["user_dashboard", currentUserId],
        });
        chatCache.invalidate(`user_dashboard_${currentUserId}`, currentUserId);
      } catch (error) {
        toast.error("Failed to raise ticket. Please try again.");
        queryClient.invalidateQueries({
          queryKey: getSidebarKey(currentUserId!, false),
        });
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
          <DialogTitle className="text-center text-xl">
            Raise a Support Ticket
          </DialogTitle>
          {/* Dialog Description */}
          <DialogDescription className="text-center">
            Having trouble? Describe your issue and we'll help you out.
          </DialogDescription>
          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-[10px] font-medium text-center">
            Please mention all the required details and information. Cannot be
            modified once submitted.
          </div>
          {limitStatus.limitReached && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs font-medium text-center">
              Limit Reached: You have 3 active tickets. Please wait for them to
              be resolved before raising new ones.
            </div>
          )}

          {isLessonSpecific && (
            <div className="mt-4 p-3 bg-muted/50 border border-border rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                <span>Context Info</span>
                <span className="text-primary/70">Read Only</span>
              </div>
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  <span className="font-semibold text-foreground/70 min-w-[50px]">
                    Course:
                  </span>
                  <span className="text-foreground truncate">{courseName}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="font-semibold text-foreground/70 min-w-[50px]">
                    Lesson:
                  </span>
                  <span className="text-foreground truncate">{lessonName}</span>
                </div>
              </div>
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
                <SelectItem value="fault">Fault / Bug Report</SelectItem>
                <SelectItem value="error">Error / Technical Issue</SelectItem>
                <SelectItem value="improve">Improvement Suggestion</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Dialog Form Input */}
          <div className="space-y-2">
            <Label htmlFor="title">Issue Summary</Label>
            <Input
              id="title"
              placeholder={currentSummaryPlaceholder}
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
              placeholder={currentPlaceholder}
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
            <Button
              type="submit"
              disabled={isPending || limitStatus.limitReached}
            >
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
