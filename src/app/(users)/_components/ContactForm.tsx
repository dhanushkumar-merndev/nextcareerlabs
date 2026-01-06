"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

// Define the form schema
const contactFormSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  program: z.string().min(1, "Please select a program"),
  about: z
    .string()
    .min(20, "Please tell us more about yourself (minimum 20 characters)"),
  resume: z.instanceof(File).optional(),
});

type ContactFormType = z.infer<typeof contactFormSchema>;

export default function ContactForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<ContactFormType>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      program: "",
      about: "",
    },
  });

  async function onSubmit(data: ContactFormType) {
    startTransition(async () => {
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1500));

        console.log("Form submitted:", data);
        toast.success("Application submitted successfully!");

        form.reset();
        setSelectedFile(null);
      } catch (error) {
        toast.error("Failed to submit application. Please try again.");
      }
    });
  }

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileChange(file);
    }
  };

  // Handle file selection
  const handleFileChange = (file: File) => {
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PDF, DOC, or DOCX file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSelectedFile(file);
    form.setValue("resume", file);
  };

  // Remove selected file
  const removeFile = () => {
    setSelectedFile(null);
    form.setValue("resume", undefined);
  };

  return (
    <section className="min-h-screen w-full flex items-center justify-center pt-6 px-4">
      <div className="w-full max-w-4xl">
        {/* ===== SECTION HEADING ===== */}
        <div className="text-center mb-12 space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold">Contact us</h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Interested in joining our programs? Fill out the form below and our
            team will reach out to you shortly.
          </p>
        </div>

        {/* ===== FORM WRAPPER (TRANSPARENT) ===== */}
        <div className="bg-transparent border border-border/60 rounded-xl p-8 md:p-10">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* ===== ROW 1: Name & Email ===== */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          className="bg-background/50"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your.email@example.com"
                          className="bg-background/50"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ===== ROW 2: Phone & Program ===== */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          className="bg-background/50"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="program"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Select a program" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="salesforce">
                            Salesforce Development
                          </SelectItem>
                          <SelectItem value="devops">
                            DevOps Engineering
                          </SelectItem>
                          <SelectItem value="mern">
                            MERN Stack Development
                          </SelectItem>
                          <SelectItem value="cloud">
                            Cloud Engineering
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ===== ROW 3: About Yourself ===== */}
              <FormField
                control={form.control}
                name="about"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tell us about yourself</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        placeholder="Share your background, experience, and what interests you..."
                        className="resize-none bg-background/50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ===== ROW 4: Resume Upload with Drag & Drop (WIDER RECTANGLE) ===== */}
              <FormField
                control={form.control}
                name="resume"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resume (optional)</FormLabel>
                    <FormControl>
                      <div
                        className={`relative border-2 border-dashed rounded-lg transition-colors ${
                          dragActive
                            ? "border-primary bg-primary/5"
                            : "border-border/60 bg-background/50"
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          id="resume-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileChange(file);
                          }}
                        />

                        {!selectedFile ? (
                          <label
                            htmlFor="resume-upload"
                            className="flex items-center justify-center gap-4 py-6 cursor-pointer"
                          >
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <div className="text-left">
                              <p className="text-sm font-medium mb-0.5">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-muted-foreground">
                                PDF, DOC, or DOCX (Max 10MB)
                              </p>
                            </div>
                          </label>
                        ) : (
                          <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Upload className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {(selectedFile.size / 1024 / 1024).toFixed(2)}{" "}
                                  MB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={removeFile}
                              className="h-8 w-8"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ===== CTA (PRIMARY BUTTON) ===== */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  className="px-12 py-6 text-base font-medium"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </section>
  );
}
