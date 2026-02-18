"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, FileText, Sparkles, CheckCircle2, AlertTriangle, Copy, Save, Upload, Download } from "lucide-react";
import { storeTranscription, getTranscription } from "@/app/admin/lessons/transcription/actions";
import { saveMCQs } from "@/app/admin/lessons/mcqs/actions";
import { generateMCQPrompt, copyToClipboard, validateMCQJSON } from "@/lib/mcq/mcq-prompt-generator";
import { useEffect } from "react";
import { env } from "@/lib/env";

interface TranscriptionWorkflowProps {
  lessonId: string;
  lessonTitle: string;
  videoUrl?: string;
  videoKey?: string;
  onComplete?: () => void;
}

export function TranscriptionWorkflow({
  lessonId,
  lessonTitle,
  videoKey,
  onComplete,
}: TranscriptionWorkflowProps) {
  if (!videoKey) return null;

  const [status, setStatus] = useState<"idle" | "uploading" | "complete" | "error" | "saved">("idle");
  const [vttContent, setVttContent] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState("");
  const [isSavingMCQs, setIsSavingMCQs] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive compressed audio URL from videoKey
  const audioUrl = videoKey && videoKey.includes('.')
    ? `https://${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.t3.storage.dev/hls/${videoKey.substring(0, videoKey.lastIndexOf('.'))}/audio.ogg`
    : null;

  // Load existing transcription on mount or when videoKey changes
  useEffect(() => {
    const loadExisting = async () => {
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
            // If MCQs already exist, show the "saved" state directly
            if (result.transcription.hasMCQs) {
              setStatus("saved");
            } else {
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

      setStatus("complete");
      toast.success("Transcript uploaded and saved!");
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
                <Button size="sm" variant="outline" asChild>
                  <a href={audioUrl} download="audio.ogg">
                    <Download className="size-4 mr-2" />
                    Download Audio
                  </a>
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
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="size-4" />
              <span className="text-xs font-medium">Transcript Ready</span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                setStatus("idle");
                setVttContent(null);
                setPastedJson("");
              }}>
                Re-upload
              </Button>
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
              className="h-7 text-xs gap-1.5"
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
        <div className="pt-4 border-t text-center space-y-3 py-4">
          <div className="flex flex-col items-center justify-center gap-2 text-green-600">
            <CheckCircle2 className="size-8" />
            <p className="text-sm font-semibold">20 MCQs Saved Successfully!</p>
            <p className="text-xs text-muted-foreground">The lesson assessment is now updated.</p>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            className="mt-4"
            onClick={() => {
              setStatus("idle");
              setVttContent(null);
            }}
          >
            <Upload className="size-4 mr-2" />
            Re-upload / Update Questions
          </Button>
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
