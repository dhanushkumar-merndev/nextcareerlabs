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
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { createLesson } from "../actions";
import { toast } from "sonner";
import { chatCache } from "@/lib/chat-cache";

export function NewLessonModel({
  courseId,
  chapterId,
  onSuccess,
}: {
  courseId: string;
  chapterId: string;
  onSuccess?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const form = useForm<LessonSchemaType>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      name: "",
      courseId: courseId,
      chapterId: chapterId,
    },
  });

  async function onSubmit(data: LessonSchemaType) {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(createLesson(data));
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
        chatCache.invalidate("admin_chat_sidebar");

        queryClient.invalidateQueries({ queryKey: ["admin_static_analytics"] });
        queryClient.invalidateQueries({ queryKey: ["admin_analytics_growth"] });
        queryClient.invalidateQueries({ queryKey: ["admin_success_rate"] });
        queryClient.invalidateQueries({ queryKey: ["admin_analytics"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_stats"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_all"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_recent_courses"] });
        queryClient.invalidateQueries({ queryKey: ["admin_courses_list"] });
        queryClient.invalidateQueries({ queryKey: ["all_courses"] });
        queryClient.invalidateQueries({ queryKey: ["chat_sidebar"] });

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
        <Button variant="outline" className="w-full justify-center gap-1">
          <Plus className="size-4" /> New Lesson
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create new Lesson</DialogTitle>
          <DialogDescription>
            what would you like to name your lesson?
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lesson Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Lesson Name" {...field} />
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
