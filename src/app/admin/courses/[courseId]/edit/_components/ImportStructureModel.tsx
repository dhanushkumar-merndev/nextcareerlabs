"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { tryCatch } from "@/hooks/try-catch";
import { chatCache } from "@/lib/chat-cache";
import { useQueryClient } from "@tanstack/react-query";
import { Clipboard, FileJson, Loader2, Sparkles } from "lucide-react";
import {
  useState,
  useTransition,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { toast } from "sonner";
import { importCourseStructure } from "../actions";

const sampleJson = `{
  "chapters": [
    {
      "title": "Introduction to DevOps",
      "lessons": [
        {
          "title": "What is DevOps?",
          "description": "# What is DevOps?\\n\\nThis lesson introduces **DevOps** as a modern engineering culture that connects software development, operations, automation, and continuous delivery. Students will understand why companies moved away from slow manual release processes and how DevOps helps teams ship faster, safer, and more reliably.\\n\\n## What Students Will Learn\\n\\nStudents will explore *real workplace examples* such as automated builds, deployment pipelines, infrastructure provisioning, monitoring, and collaboration between developers and operations teams.\\n\\n- DevOps culture and collaboration\\n- Automation-first thinking\\n- CI/CD and production delivery\\n\\n[center]By the end of this lesson, students will understand what DevOps is, what problems it solves, and how it fits into modern cloud-native software delivery.[/center]"
        },
        {
          "title": "DevOps Lifecycle",
          "description": "# DevOps Lifecycle\\n\\nThis lesson explains the complete DevOps lifecycle from planning and coding to building, testing, releasing, deploying, operating, monitoring, and improving applications. Students will learn how each stage connects with the next and why feedback loops are essential for maintaining reliable systems in production.\\n\\n### Production Workflow\\n\\nThe practical focus should be on helping students think like DevOps engineers, not just tool users. They should understand how a code change moves from a developer machine to production, what checks happen along the way, how failures are detected, and how teams recover quickly.\\n\\n1. Plan and code the change\\n2. Build and test automatically\\n3. Deploy, monitor, and improve"
        }
      ]
    }
  ]
}`;

const jsonPlaceholder = `{
  "chapters": [
    {
      "title": "Chapter title",
      "lessons": [
        {
          "title": "Lesson title",
          "description": "# Heading\\n\\nLong rich lesson description with **bold**, *italic*, lists, and alignment tags."
        }
      ]
    }
  ]
}`;

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function stopScrollPropagation(event: WheelEvent | TouchEvent) {
  event.stopPropagation();
}

export function ImportStructureModel({
  courseTitle,
  courseId,
  onSuccess,
}: {
  courseTitle: string;
  courseId: string;
  onSuccess?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const prompt = `Create a production-quality course structure JSON for this course: "${courseTitle}".

Use the course reference/description that I paste after these instructions as the main source. Build the chapters, lesson names, and lesson descriptions from that reference. Do not ignore the reference.

Return ONLY valid JSON. No markdown, no explanation.

Use this exact shape:
${sampleJson}

Rules:
- Create 8 to 12 chapters with clear professional titles.
- Each chapter must include 5 to 10 lessons.
- Each lesson must include title and description.
- Every lesson description must be long, detailed, polished, and useful for students.
- Write each lesson description as rich Markdown text inside one JSON string.
- Each lesson description must be at least 120 to 220 words.
- Do not write short summaries. Do not write one-line descriptions.
- Use the same level of detail as a full course description section, not a bullet point.
- Descriptions should explain what the lesson covers, why it matters, practical skills students gain, hands-on activities, production use cases, and expected outcomes.
- Where relevant, mention tools, commands, workflows, projects, deployment scenarios, debugging steps, or real engineering decisions.
- Make each lesson description specific to that lesson. Do not repeat the same generic text.
- Use Markdown formatting inside description strings:
  - # for Heading 1
  - ## for Heading 2
  - ### for Heading 3
  - **bold** for important terms
  - *italic* for emphasis
  - - bullet lists for topic lists
  - 1. numbered lists for process steps
  - [center]text[/center], [right]text[/right], or [left]text[/left] when alignment is useful
- Use paragraphs separated with \\n\\n inside the JSON string.
- Do not include image fields, video fields, IDs, slugs, or durations.
- Do not include markdown tables.
- Keep the JSON valid: escape quotes inside strings and do not add trailing commas.
- If the output becomes too large, still keep descriptions detailed and reduce the number of lessons per chapter instead of making descriptions short.

After this line, I will paste the full course description/reference:

PASTE COURSE DESCRIPTION HERE`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    toast.success("Prompt copied");
  }

  async function onImport() {
    let parsed: unknown;

    try {
      parsed = JSON.parse(stripJsonFence(jsonText));
    } catch {
      toast.error("Paste valid JSON from ChatGPT first");
      return;
    }

    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        importCourseStructure(courseId, parsed),
      );

      if (error) {
        toast.error("Failed to import structure. Please try again.");
        return;
      }

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      chatCache.invalidate("admin_analytics");
      chatCache.invalidate("admin_static_analytics");
      chatCache.invalidate("admin_dashboard_stats");
      chatCache.invalidate("admin_dashboard_all");
      chatCache.invalidate("admin_dashboard_recent_courses");
      chatCache.invalidate("admin_courses_list");
      chatCache.invalidate("all_courses");
      chatCache.invalidate("admin_chat_sidebar");
      chatCache.invalidate(`admin_course_${courseId}`);

      queryClient.invalidateQueries({ queryKey: ["admin_static_analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin_analytics_growth"] });
      queryClient.invalidateQueries({ queryKey: ["admin_success_rate"] });
      queryClient.invalidateQueries({ queryKey: ["admin_analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin_dashboard_stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin_dashboard_all"] });
      queryClient.invalidateQueries({
        queryKey: ["admin_dashboard_recent_courses"],
      });
      queryClient.invalidateQueries({ queryKey: ["admin_courses_list"] });
      queryClient.invalidateQueries({ queryKey: ["all_courses"] });
      queryClient.invalidateQueries({ queryKey: ["chat_sidebar"] });
      queryClient.invalidateQueries({ queryKey: [`admin_course_${courseId}`] });

      onSuccess?.();
      setJsonText("");
      setIsOpen(false);
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative gap-2">
          <Sparkles className="size-4" />
          AI Structure
          <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold bg-background text-primary border border-primary px-1 rounded-sm leading-tight">
            NEW
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import chapters and lessons</DialogTitle>
          <DialogDescription>
            Copy the prompt, ask ChatGPT for JSON, then paste the JSON output
            here.
          </DialogDescription>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
          data-lenis-prevent
          onWheel={stopScrollPropagation}
          onTouchMove={stopScrollPropagation}
        >
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Generate JSON with AI</p>
              <p className="text-xs text-muted-foreground">
                Copy this prompt, paste it in ChatGPT, then paste the JSON
                response below.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full shrink-0 gap-2 sm:w-auto"
              onClick={copyPrompt}
            >
              <Clipboard className="size-4" />
              Copy Prompt
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="structure-json">Paste AI JSON output</Label>
            <Textarea
              id="structure-json"
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              placeholder={jsonPlaceholder}
              className="min-h-56 max-h-[45dvh] resize-y font-mono text-xs"
              data-lenis-prevent
              onWheel={stopScrollPropagation}
              onTouchMove={stopScrollPropagation}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={onImport}
            disabled={isPending || !jsonText.trim()}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <FileJson className="size-4" />
                Import Structure
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
