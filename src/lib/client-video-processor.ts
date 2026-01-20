// This file acts as a bridge to the standalone script in /public/ffmpeg/processor.js
// By loading FFmpeg as a plain script tag, we bypass all Next.js/Turbopack "too dynamic" errors.

export interface TranscodeResult {
  m3u8: Blob;
  segments: { name: string; blob: Blob }[];
}

// Helper to load a script dynamically
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

export async function transcodeToHLS(
  file: File,
  onProgress: (progress: number) => void
): Promise<TranscodeResult> {
  // 1. Ensure scripts are loaded in order
  await loadScript("/ffmpeg/ffmpeg.js");
  await loadScript("/ffmpeg/processor.js");

  // 2. Call the global function defined in processor.js
  if (!window.transcodeVideoToHLS) {
    throw new Error("Transcoder script not initialized properly");
  }

  return window.transcodeVideoToHLS(file, onProgress);
}

// Keep this to satisfy types, but it's now handled by processor.js
export async function loadFFmpeg() {
  return null;
}

// TypeScript Declaration for the global function
declare global {
  interface Window {
    transcodeVideoToHLS: (
      file: File,
      onProgress: (progress: number) => void
    ) => Promise<TranscodeResult>;
    FFmpegWASM: any;
    FFmpegUtil: any;
  }
}
