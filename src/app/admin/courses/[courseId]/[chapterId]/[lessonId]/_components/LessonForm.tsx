"use client";
import { AdminLessonType } from "@/app/data/admin/admin-get-lesson";
import { Uploader } from "@/components/file-uploader/Uploader";
import { RichTextEditor } from "@/components/rich-text-editor/Editor";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateLesson } from "../actions";
import { useRouter } from "next/navigation";
import { TranscriptionWorkflow } from "./TranscriptionWorkflow";
import { env } from "@/lib/env";

interface iAppProps {
  data: AdminLessonType;
  chapterId: string;
  courseId: string;
}

export function LessonForm({ data, chapterId, courseId }: iAppProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<LessonSchemaType>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      name: data.title,
      chapterId: chapterId,
      courseId: courseId,
      description: data.description ?? undefined,
      videoKey: data.videoKey ?? undefined,
      thumbnailKey: data.thumbnailKey ?? undefined,
      duration: data.duration ?? undefined,
      spriteKey: data.spriteKey ?? undefined,
      spriteCols: data.spriteCols ?? undefined,
      spriteRows: data.spriteRows ?? undefined,
      spriteInterval: data.spriteInterval ?? undefined,
      spriteWidth: data.spriteWidth ?? undefined,
      spriteHeight: data.spriteHeight ?? undefined,
      lowResKey: data.lowResKey ?? undefined,
    },
  });

  const watchedVideoKey = form.watch("videoKey");

  async function onSubmit(values: LessonSchemaType, skipRedirect = false) {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        updateLesson(values, data.id)
      );
      if (error) {
        toast.error("An unexpected error occurred. Please try again later");
        return;
      }
      if (result.status === "success") {
        if (!skipRedirect) {
          toast.success(result.message);
          router.push(`/admin/courses/${courseId}/edit?tab=course-structure`);
        } else {
          router.refresh();
        }
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }
  return (
    <div className="px-4 lg:px-6">
      <Link
        href={`/admin/courses/${courseId}/edit?tab=course-structure`}
        className={buttonVariants({ variant: "outline", className: "mb-6" })}
      >
        <ArrowLeft className="size-4"></ArrowLeft>
        <span>Go Back</span>
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Lesson Configuration</CardTitle>
          <CardDescription>
            configure the video and the description for this lesson
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit((values) => onSubmit(values, false))}>
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
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <RichTextEditor field={field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="thumbnailKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thumbnai Image</FormLabel>
                    <FormControl>
                      <Uploader
                        onChange={field.onChange}
                        value={field.value}
                        fileTypeAccepted="image"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="videoKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Video File</FormLabel>
                    <FormControl>
                      <Uploader
                        onChange={(val: string | null) => {
                          field.onChange(val);
                          // Auto-save to DB only on successful upload (when val is truthy)
                          // This prevents losing the key if the user refreshes during transcoding.
                          if (val) {
                            onSubmit({
                              ...form.getValues(),
                              videoKey: val,
                              duration: form.getValues("duration")
                            }, true);
                          }
                        }}
                        onDurationChange={(duration) => form.setValue("duration", duration)}
                        onSpriteChange={(sprite) => {
                          // Set sprite values in form and auto-save
                          form.setValue("spriteKey", sprite.spriteKey);
                          form.setValue("spriteCols", sprite.spriteCols);
                          form.setValue("spriteRows", sprite.spriteRows);
                          form.setValue("spriteInterval", sprite.spriteInterval);
                          form.setValue("spriteWidth", sprite.spriteWidth);
                          form.setValue("spriteHeight", sprite.spriteHeight);
                          form.setValue("lowResKey", sprite.lowResKey);
                          // Auto-save with sprite data
                          onSubmit({
                            ...form.getValues(),
                            spriteKey: sprite.spriteKey,
                            spriteCols: sprite.spriteCols,
                            spriteRows: sprite.spriteRows,
                            spriteInterval: sprite.spriteInterval,
                            spriteWidth: sprite.spriteWidth,
                            spriteHeight: sprite.spriteHeight,
                            lowResKey: sprite.lowResKey,
                          }, true);
                        }}
                        value={field.value}
                        fileTypeAccepted="video"
                        duration={form.getValues("duration") ?? undefined}
                        initialSpriteKey={form.getValues("spriteKey")}
                      />
                    </FormControl>
                    <TranscriptionWorkflow 
                      lessonId={data.id}
                      lessonTitle={data.title}
                      videoUrl={watchedVideoKey ? `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/${watchedVideoKey}` : undefined}
                      videoKey={watchedVideoKey ?? undefined}
                      onComplete={() => router.refresh()}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={isPending}
                className="w-full cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="ml-1 size-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Lesson"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
