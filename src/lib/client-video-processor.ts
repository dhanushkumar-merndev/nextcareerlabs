// This file acts as a bridge to the standalone script in /public/ffmpeg/processor.js
// By loading FFmpeg as a plain script tag, we bypass all Next.js/Turbopack "too dynamic" errors.

export interface TranscodeResult {
  m3u8: Blob;
  segments: { name: string; blob: Blob }[];
  audioBlob: Blob | null;
}

export interface ProcessingProgressInfo {
  phase?: "hls" | "audio";
  processedSeconds?: number;
  totalSeconds?: number;
}

export const MAX_BROWSER_TRANSCODE_SIZE_BYTES = 1280 * 1024 * 1024;
export const MAX_BROWSER_TRANSCODE_SIZE_LABEL = "1.25GB";

// Helper to load a script dynamically
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remove ANY existing script tag that matches the base filename to prevent stale logic
    const baseUrl = url.split("?")[0];
    const existing = document.querySelectorAll(`script`);
    existing.forEach(s => {
      if (s.src.includes(baseUrl)) {
        console.warn(`Removing stale script: ${s.src}`);
        s.parentNode?.removeChild(s);
      }
    });

    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

// Note: ffmpeg.wasm has a hard memory limit (~2GB). Even with WORKERFS input
// mounting, very large outputs can still exhaust the browser WASM heap.

async function ensureScriptsLoaded() {
  if ("FFmpegWASM" in window && "transcodeVideoToHLS" in window) {
    return;
  }

  await loadScript(`/ffmpeg/ffmpeg.js?v=final-1`);
  await loadScript(`/ffmpeg/processor.js?v=single-ts-copy-hls-1s-1`);
}

export async function transcodeToHLS(
  file: File,
  onProgress: (progress: number, info?: ProcessingProgressInfo) => void,
  duration: number,
  encryption?: { key: Uint8Array; iv: string; keyUrl: string; keyBase64?: string }
): Promise<TranscodeResult> {
  if (file.size > MAX_BROWSER_TRANSCODE_SIZE_BYTES) {
    throw new Error(
      `This video is too large for in-browser processing. Please use a file under ${MAX_BROWSER_TRANSCODE_SIZE_LABEL}.`,
    );
  }

  await ensureScriptsLoaded();

  if (!window.transcodeVideoToHLS) {
    throw new Error("Transcoder script not initialized properly");
  }

  return window.transcodeVideoToHLS(file, onProgress, duration, encryption);
}

export async function compressAudio(
  file: File,
  onProgress: (progress: number, info?: ProcessingProgressInfo) => void,
  duration?: number
): Promise<Blob> {
  await ensureScriptsLoaded();

  if (!window.compressAudio) {
    throw new Error("Audio compressor script not initialized properly");
  }

  return window.compressAudio(file, onProgress, duration);
}

// Keep this to satisfy types, but it's now handled by processor.js
export async function loadFFmpeg() {
  return null;
}

// TypeScript Declaration for the global functions
declare global {
  interface Window {
    transcodeVideoToHLS: (
      file: File,
      onProgress: (progress: number, info?: ProcessingProgressInfo) => void,
      duration: number,
      encryption?: { key: Uint8Array; iv: string; keyUrl: string }
    ) => Promise<TranscodeResult & { audioBlob: Blob | null }>;
    FFmpegWASM: unknown;
    FFmpegUtil: unknown;
    compressAudio: (
      file: File,
      onProgress: (progress: number, info?: ProcessingProgressInfo) => void,
      duration?: number
    ) => Promise<Blob>;
  }
}
