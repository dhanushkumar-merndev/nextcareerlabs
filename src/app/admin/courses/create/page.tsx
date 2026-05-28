"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  courseCategories,
  courseLevels,
  courseSchema,
  CourseSchemaType,
  courseStatus,
} from "@/lib/zodSchemas";
import { ArrowLeft, Loader2, PlusCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import slugify from "slugify";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/rich-text-editor/Editor";
import { Uploader } from "@/components/file-uploader/Uploader";
import { useTransition, useEffect } from "react";
import { tryCatch } from "@/hooks/try-catch";
import { CreateCourse } from "./actions";
import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";
import { useSmartSession } from "@/hooks/use-smart-session";
import { chatCache } from "@/lib/chat-cache";
import {
  getFirstFormErrorMessage,
  safeZodResolver,
} from "@/lib/safe-zod-resolver";

export default function CourseCreationPage() {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const { user } = useSmartSession();
  const form = useForm<CourseSchemaType>({
    resolver: safeZodResolver(courseSchema),
    defaultValues: {
      title: "",
      description: "",
      fileKey: "",
      duration: 0,
      level: "Beginner",
      category: "Development",
      smallDescription: "",
      slug: "",
      status: "Draft",
      isFree: false,
      freeChaptersCount: 0,
    },
  });
  const watchedHasDemo = useWatch({ control: form.control, name: "isFree" });
  const watchedSmallDescription =
    useWatch({ control: form.control, name: "smallDescription" }) ?? "";

  useEffect(() => {
    if (!watchedHasDemo) {
      form.setValue("freeChaptersCount", 0);
    }
  }, [watchedHasDemo, form]);

  function onSubmit(values: CourseSchemaType) {
    if (!values.fileKey) {
      form.setError("fileKey", { message: "File must be selected" });
      return;
    }
    startTransition(async () => {
      const { data: result, error } = await tryCatch(CreateCourse(values));
      if (error) {
        toast.error("An unexpected error occurred. Please try again later");
        return;
      }
      if (result.status === "success") {
        toast.success(result.message);
        chatCache.invalidate("admin_chat_sidebar");
        chatCache.invalidate("admin_courses_list");
        chatCache.invalidate("all_courses");
        chatCache.invalidate("admin_dashboard_stats");
        chatCache.invalidate("admin_dashboard_enrollments");
        chatCache.invalidate("admin_dashboard_recent_courses");
        chatCache.invalidate("admin_analytics");
        chatCache.invalidate("admin_dashboard_all");

        if (user?.id) {
          chatCache.invalidate(`all_courses_${user.id}`);
          chatCache.invalidate(`available_courses_${user.id}`);

          // Also invalidate the base keys with userId prefix (handled by chatCache helper)
          chatCache.invalidate("all_courses", user.id);
          chatCache.invalidate("available_courses", user.id);

          // Handle redundant prefixes used in AvailableCoursesClient
          chatCache.invalidate(`available_courses_${user.id}`, user.id);
          chatCache.invalidate(`all_courses_${user.id}`, user.id);
        }

        // Always invalidate guest versions
        chatCache.invalidate("all_courses");
        chatCache.invalidate("available_courses");
        chatCache.invalidate("available_courses_guest");
        chatCache.invalidate("all_courses_guest");

        queryClient.invalidateQueries({ queryKey: ["chat_sidebar"] });
        queryClient.invalidateQueries({ queryKey: ["admin_courses_list"] });
        queryClient.invalidateQueries({ queryKey: ["all_courses"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_stats"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_enrollments"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_recent_courses"] });
        queryClient.invalidateQueries({ queryKey: ["admin_analytics"] });
        queryClient.invalidateQueries({ queryKey: ["admin_dashboard_all"] });
        form.reset();
        sessionStorage.setItem("course_created_confetti", "1");
        window.location.href = "/admin/courses?created=1";
      } else if (result.status === "error") {
        toast.error(result.message);
      }
    });
  }

  function onInvalid(errors: FieldErrors<CourseSchemaType>) {
    toast.error(
      getFirstFormErrorMessage(
        errors,
        "Please fill all required fields before creating the course",
      ),
    );
  }

  return (
    <div className="p-4 lg:px-6 flex gap-4 flex-col">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/courses"
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1>Create a new course</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Provide basic information about the course.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-4 items-start">
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="Slug" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-5.5">
                  <Button
                    type="button"
                    className="w-fit cursor-pointer"
                    onClick={() => {
                      const titleValue = form.getValues("title");
                      const slug = slugify(titleValue, {
                        lower: true,
                        strict: true,
                      });
                      form.setValue("slug", slug, {
                        shouldDirty: true,
                      });
                    }}
                  >
                    Generate Slug <Sparkles className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
              <FormField
                control={form.control}
                name="smallDescription"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Small Description</FormLabel>
                    <FormControl>
                      <Textarea
                        className="min-h-30"
                        placeholder="Small Description"
                        maxLength={200}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {watchedSmallDescription.length}/200 characters
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="w-full">
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
                name="fileKey"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Thumbnail image</FormLabel>
                    <FormControl>
                      <Uploader
                        onChange={(val) => field.onChange(val ?? "")}
                        value={field.value}
                        fileTypeAccepted="image"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-col-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Category</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Categories" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {courseCategories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Level</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Value" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {courseLevels.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Duration (hours)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Duration"
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {courseStatus.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <h3 className="font-semibold text-lg">Access</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="isFree"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Access Type</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "demo")}
                          defaultValue={field.value ? "demo" : "request"}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Access" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            <SelectItem value="request">Request Access</SelectItem>
                            <SelectItem value="demo">Demo Chapters</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedHasDemo ? (
                    <FormField
                      control={form.control}
                      name="freeChaptersCount"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Demo Chapters</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Set after adding chapters"
                              type="number"
                              min={0}
                              max={0}
                              disabled
                              {...field}
                              value={0}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Add chapters in the course, then edit to set the demo chapter count</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Students must request access and wait for admin approval.
                    </div>
                  )}
                </div>
              </div>

              <Button
                className="cursor-pointer"
                type="submit"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    Creating...
                    <Loader2 className="ml-1 size-4 animate-spin" />
                  </>
                ) : (
                  <>
                    Create Course <PlusCircle className="ml-1 size-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
