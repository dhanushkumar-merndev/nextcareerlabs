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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { tryCatch } from "@/hooks/try-catch";
import { chapterSchema, ChapterSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { createChapter } from "../actions";
import { toast } from "sonner";
import { chatCache } from "@/lib/chat-cache";

export function NewChapterModel({
  courseId,
  onSuccess,
}: {
  courseId: string;
  onSuccess?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const form = useForm<ChapterSchemaType>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      name: "",
      courseId: courseId,
    },
  });

  async function onSubmit(data: ChapterSchemaType) {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(createChapter(data));
      if (error) {
        toast.error("Failed to create chapter. Please try again.");
        return;
      }
      if (result.status === "success") {
        toast.success(result.message);

        // Client-side cache invalidation
        chatCache.invalidate("admin_analytics");
        chatCache.invalidate("admin_static_analytics");
        chatCache.invalidate("admin_dashboard_stats");
        chatCache.invalidate("admin_dashboard_all");
        chatCache.invalidate("admin_dashboard_recent_courses");
        chatCache.invalidate("admin_courses_list");
        chatCache.invalidate("all_courses");

        queryClient.invalidateQueries({ queryKey: ["admin_static_analytics"] });
        queryClient.invalidateQueries({ queryKey: ["admin_analytics_growth"] });
        queryClient.invalidateQueries({ queryKey: ["admin_success_rate"] });
        queryClient.invalidateQueries({ queryKey: ["admin_analytics"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_stats"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_all"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_recent_courses"] });
        queryClient.invalidateQueries({ queryKey: ["admin_courses_list"] });
        queryClient.invalidateQueries({ queryKey: ["all_courses"] });

        onSuccess?.();
        form.reset();
        setIsOpen(false);
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="size-4" /> New Chapter
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create new Chapter</DialogTitle>
          <DialogDescription>
            what would you like to name your chapter?
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chapter Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Chapter Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button disabled={isPending} type="submit">
                {isPending ? (
                  <>
                    <Loader2 className="mr-1 size-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Change"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
