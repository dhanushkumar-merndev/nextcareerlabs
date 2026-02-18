// This file acts as a bridge to the standalone script in /public/ffmpeg/processor.js
// By loading FFmpeg as a plain script tag, we bypass all Next.js/Turbopack "too dynamic" errors.

export interface TranscodeResult {
  m3u8: Blob;
  segments: { name: string; blob: Blob }[];
  audioBlob: Blob | null;
}

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

// Note: ffmpeg.wasm has a hard memory limit (~2GB). 
// Processing files > 1.5GB on the client usually results in "out of bounds" crashes.

async function ensureScriptsLoaded() {
  if ("FFmpegWASM" in window && "transcodeVideoToHLS" in window) {
    return;
  }

  await loadScript(`/ffmpeg/ffmpeg.js?v=final-1`);
  await loadScript(`/ffmpeg/processor.js?v=opt-2`);
}

export async function transcodeToHLS(
  file: File,
  onProgress: (progress: number) => void,
  duration: number
): Promise<TranscodeResult> {
  await ensureScriptsLoaded();

  if (!window.transcodeVideoToHLS) {
    throw new Error("Transcoder script not initialized properly");
  }

  return window.transcodeVideoToHLS(file, onProgress, duration);
}

export async function compressAudio(
  file: File,
  onProgress: (progress: number) => void
): Promise<Blob> {
  await ensureScriptsLoaded();

  if (!window.compressAudio) {
    throw new Error("Audio compressor script not initialized properly");
  }

  return window.compressAudio(file, onProgress);
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
      onProgress: (progress: number) => void,
      duration: number
    ) => Promise<TranscodeResult & { audioBlob: Blob | null }>;
    FFmpegWASM: any;
    FFmpegUtil: any;
    compressAudio: (
      file: File,
      onProgress: (progress: number) => void
    ) => Promise<Blob>;
  }
}
