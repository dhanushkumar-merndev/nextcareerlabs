"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, FileText, Sparkles, CheckCircle2, AlertTriangle, Copy, Save, Upload, Download, Trash2 } from "lucide-react";
import { storeTranscription, getTranscription, deleteTranscription } from "@/app/admin/lessons/transcription/actions";
import { saveMCQs } from "@/app/admin/lessons/mcqs/actions";
import { generateMCQPrompt, copyToClipboard, validateMCQJSON } from "@/lib/mcq/mcq-prompt-generator";
import { useEffect } from "react";
import { env } from "@/lib/env";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TranscriptionWorkflowProps {
  lessonId: string;
  lessonTitle: string;
  videoUrl?: string;
  videoKey?: string;
  onComplete?: () => void;
  onTranscriptionUpload?: (url: string) => void;
  onCaptionDelete?: () => void;
  initialTranscription?: {
    id: string;
    vttUrl: string;
    status: string;
    hasMCQs: boolean;
  };
  initialHasMCQs?: boolean;
}

export function TranscriptionWorkflow({
  lessonId,
  lessonTitle,
  videoKey,
  onComplete,
  onTranscriptionUpload,
  onCaptionDelete,
  initialTranscription,
  initialHasMCQs,
}: TranscriptionWorkflowProps) {


  const [status, setStatus] = useState<"idle" | "uploading" | "complete" | "error" | "saved">("idle");
  const [vttContent, setVttContent] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState("");
  const [isSavingMCQs, setIsSavingMCQs] = useState(false);
  const [hasMCQs, setHasMCQs] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive compressed audio URL from videoKey
  const audioUrl = videoKey && videoKey.includes('.')
    ? `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/hls/${videoKey.substring(0, videoKey.lastIndexOf('.'))}/audio.ogg`
    : null;

  // Load existing transcription on mount or when videoKey changes
  useEffect(() => {
    const loadExisting = async () => {
      // If we have initial data, use it and skip the fetch
      if (initialTranscription) {
        setIsInitialLoading(true);
        setVttContent(null);
        setPastedJson("");

        try {
          const vttRes = await fetch(initialTranscription.vttUrl);
          if (vttRes.ok) {
            const content = await vttRes.text();
            setVttContent(content);
            if (initialHasMCQs) {
              setHasMCQs(true);
              setStatus("saved");
            } else {
              setHasMCQs(false);
              setStatus("complete");
            }
          }
        } catch (err) {
          console.warn("[TranscriptionWorkflow] Initial load failed:", err);
        } finally {
          setIsInitialLoading(false);
        }
        return;
      }

      setIsInitialLoading(true);
      // Reset local states for fresh check
      setStatus("idle");
      setVttContent(null);
      setPastedJson("");

      try {
        const result = await getTranscription(lessonId);
        if (result.success && result.transcription) {
          // Fetch the actual content from the URL
          const vttRes = await fetch(result.transcription.vttUrl);
          if (vttRes.ok) {
            const content = await vttRes.text();
            setVttContent(content);
            // If MCQs already exist, track it
            if (result.transcription.hasMCQs) {
              setHasMCQs(true);
              setStatus("saved");
            } else {
              setHasMCQs(false);
              setStatus("complete");
            }
          }
        }
      } catch (err) {
        console.warn("[TranscriptionWorkflow] Load failed:", err);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadExisting();
  }, [lessonId, videoKey]); // Trigger reset and reload if video changes

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center p-8 border rounded-lg bg-muted/30">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-[10px] text-muted-foreground animate-pulse">Checking status...</p>
        </div>
      </div>
    );
  }

  const handleVTTUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.vtt')) {
      toast.error("Please upload a .vtt file");
      return;
    }

    try {
      setStatus("uploading");

      // Read file content
      const content = await file.text();
      
      if (!content.trim().startsWith('WEBVTT')) {
        toast.error("Invalid VTT file: must start with WEBVTT header");
        setStatus("idle");
        return;
      }

      setVttContent(content);

      // Save to S3
      const result = await storeTranscription(lessonId, content, videoKey);
      
      if (!result.success) {
        throw new Error(result.error || "Failed to save transcription");
      }

      // 🔔 Notify parent to update preview player instantly
      if (result.transcriptionId) {
        // Fetch new VTT URL (or we could return it from storeTranscription)
        const check = await getTranscription(lessonId);
        if (check.success && check.transcription?.vttUrl) {
           onTranscriptionUpload?.(check.transcription.vttUrl);
        }
      }

      // If we already have MCQs, go back to "saved" status but with new transcript loaded
      if (hasMCQs) {
        setStatus("saved");
      } else {
        setStatus("complete");
      }
      toast.success("Transcript updated!");
    } catch (error: any) {
      console.error("[VTT Upload Error]", error);
      setStatus("error");
      toast.error(error.message || "Upload failed");
    }
  };

  const handleCopyPrompt = async () => {
    if (!vttContent) return;
    const prompt = generateMCQPrompt(vttContent, lessonTitle);
    await copyToClipboard(prompt);
    toast.success("AI Prompt copied! Paste into ChatGPT or Claude.");
  };

  const handleSaveMCQs = async () => {
    if (!pastedJson.trim()) {
      toast.error("Please paste the AI's JSON output first");
      return;
    }

    try {
      setIsSavingMCQs(true);
      
      const validation = validateMCQJSON(pastedJson);
      if (!validation.valid) {
        toast.error(validation.error || "Invalid JSON format");
        return;
      }

      const result = await saveMCQs(lessonId, JSON.stringify(validation.questions));
      
      if (result.success) {
        toast.success(`Saved ${result.count} MCQs!`);
        setPastedJson("");
        setHasMCQs(true);
        setStatus("saved"); // Switch to saved state
        onComplete?.();
      } else {
        toast.error(result.error || "Failed to save MCQs");
      }
    } catch (error) {
      toast.error("An error occurred while saving MCQs");
    } finally {
      setIsSavingMCQs(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (!audioUrl) return;
    try {
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lessonTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_audio.ogg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download audio. Try right-click > Save as.");
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const result = await deleteTranscription(lessonId);
      if (result.success) {
        toast.success("Captions deleted");
        setVttContent(null);
        setStatus("idle");
        onCaptionDelete?.();
      } else {
        toast.error(result.error || "Failed to delete");
      }
    } catch (err) {
      toast.error("Cleanup failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Transcription & MCQs
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a .vtt transcript and generate MCQ questions
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {(status === "idle" || status === "error") && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vtt"
                className="hidden"
                onChange={handleVTTUpload}
              />
              <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4 mr-2" />
                Upload .vtt
              </Button>
              {audioUrl && (
                <Button type="button" size="sm" variant="outline" onClick={handleDownloadAudio}>
                  <Download className="size-4 mr-2" />
                  Download Audio
                </Button>
              )}
            </>
          )}

          {status === "uploading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-xs">Uploading...</span>
            </div>
          )}

          {status === "complete" && (
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="size-4" />
              <span className="text-xs font-medium">Transcript Ready</span>
              <Button type="button" size="sm" variant="outline" className="text-xs hover:text-primary cursor-pointer" onClick={() => {
                setStatus("idle");
                setVttContent(null);
                setPastedJson("");
              }}>
                Re-upload
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="ghost" 
                    className="text-xs text-destructive/50 hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the captions and MCQs for this lesson. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>

      {status === "complete" && vttContent && (
        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-amber-500" />
              MCQ Generation
            </h5>
            <Button 
              type="button"
              size="sm" 
              variant="outline" 
              className="h-7 text-xs gap-1.5 cursor-pointer"
              onClick={handleCopyPrompt}
            >
              <Copy className="size-3" />
              Copy AI Prompt
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">HOW TO USE:</p>
            <ol className="text-[10px] space-y-0.5 list-decimal list-inside text-muted-foreground">
              <li>Click <strong>Copy AI Prompt</strong> above</li>
              <li>Paste into <strong>ChatGPT</strong> or <strong>Claude</strong></li>
              <li>Copy the JSON response</li>
              <li>Paste it below and save</li>
            </ol>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-muted-foreground">
              PASTE AI JSON OUTPUT (EXACTLY 20 QUESTIONS)
            </label>
            <Textarea
              placeholder='[ { "question": "...", "options": [...], "correctIdx": 0, "explanation": "..." }, ... ]'
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              className="min-h-[120px] text-xs font-mono"
            />
            <Button 
              type="button"
              size="sm" 
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleSaveMCQs}
              disabled={isSavingMCQs || !pastedJson.trim()}
            >
              {isSavingMCQs ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Process & Save MCQs
            </Button>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div className="pt-4 border-t text-center space-y-6 py-4">
          <div className="flex flex-col items-center justify-center gap-2 text-primary mt-5">
            <CheckCircle2 className="size-8" />
            <p className="text-sm font-semibold">20 MCQs Saved Successfully!</p>
            <p className="text-xs text-muted-foreground">The lesson assessment is now updated.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setStatus("complete");
              }}
            >
              <Sparkles className="size-4 mr-2 text-amber-500" />
              Update Questions
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setStatus("idle");
                setVttContent(null);
                setPastedJson("");
              }}
            >
              <Upload className="size-4 mr-2" />
              Re-upload Transcript
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Trash2 className="size-4 mr-2" />}
                  Delete Captions
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the captions and MCQs for this lesson. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded-md">
          <AlertTriangle className="size-4" />
          <span className="text-xs">Upload failed. Please try again.</span>
        </div>
      )}
    </div>
  );
}
