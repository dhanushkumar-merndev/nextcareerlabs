export interface SpriteGenerationResult {
  vttBlob: Blob;
  spriteBlobs: Blob[];
  spriteFileNames: string[]; // e.g. ["sprite-0.jpg", "sprite-1.jpg"]
}

export type ProgressCallback = (progress: number, status: string) => void;

export class SpriteGenerator {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;
  private interval: number; // seconds
  private colCount: number;
  private rowCount: number; // max rows per sheet (calculated from max frames per sheet)

  constructor(
    width = 160,
    height = 90,
    interval = 10,
    colCount = 5 // 5 cols * 160 = 800px wide
  ) {
    this.width = width;
    this.height = height;
    this.interval = interval;
    this.colCount = colCount;
    this.rowCount = 0; // Will be dynamic based on duration/max frames

    // Create video element
    this.video = document.createElement("video");
    this.video.crossOrigin = "anonymous";
    this.video.muted = true;
    this.video.preload = "auto";
    
    // Prefer OffscreenCanvas if available for better performance/worker support potential
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(width, height);
      this.ctx = this.canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;
    }
  }

  public async generate(file: File, onProgress?: ProgressCallback): Promise<SpriteGenerationResult> {
    const objectUrl = URL.createObjectURL(file);
    this.video.src = objectUrl;

    try {
      await this.loadVideoMetadata();
      const duration = this.video.duration;
      const totalFrames = Math.ceil(duration / this.interval);
      
      // Strategy: 1 Sprite Sheet per hour of video
      // 1 hour = 3600s = 360 frames (at 10s interval)
      const framesPerSheet = 360; 
      const sheetCount = Math.ceil(totalFrames / framesPerSheet);
      
      const spriteBlobs: Blob[] = [];
      const spriteFileNames: string[] = [];
      const vttLines: string[] = ["WEBVTT", ""];

      for (let i = 0; i < sheetCount; i++) {
        const startFrame = i * framesPerSheet;
        const endFrame = Math.min((i + 1) * framesPerSheet, totalFrames);
        const frameCountForSheet = endFrame - startFrame;
        
        // Calculate canvas dimensions for this sheet
        const rows = Math.ceil(frameCountForSheet / this.colCount);
        const sheetWidth = this.colCount * this.width;
        const sheetHeight = rows * this.height;

        // Resize canvas for the full sheet
        if (this.canvas instanceof OffscreenCanvas) {
            this.canvas.width = sheetWidth;
            this.canvas.height = sheetHeight;
        } else {
            (this.canvas as HTMLCanvasElement).width = sheetWidth;
            (this.canvas as HTMLCanvasElement).height = sheetHeight;
        }

        // Fill background with black (optional, good for letterboxing if needed)
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, sheetWidth, sheetHeight);

        const fileName = `sprite-${i}.jpg`;
        spriteFileNames.push(fileName);
        
        // Process frames for this sheet
        await this.processBatch(
          startFrame, 
          endFrame, 
          i, 
          fileName, 
          vttLines, 
          onProgress, 
          totalFrames
        );

        // Export sheet to blob
        const blob = await this.canvasToBlob();
        spriteBlobs.push(blob);
        
        // Minimal cleanup between sheets
        this.ctx.clearRect(0, 0, sheetWidth, sheetHeight);
      }

      // Generate final VTT blob
      const vttContent = vttLines.join("\n");
      const vttBlob = new Blob([vttContent], { type: "text/vtt" });

      return {
        vttBlob,
        spriteBlobs,
        spriteFileNames
      };

    } finally {
      URL.revokeObjectURL(objectUrl);
      this.video.removeAttribute("src");
      this.video.load();
    }
  }

  private async processBatch(
    startFrame: number, 
    endFrame: number, 
    sheetIndex: number, 
    fileName: string, 
    vttLines: string[], 
    onProgress: ProgressCallback | undefined,
    totalFrames: number
  ) {
    const framesInThisBatch = endFrame - startFrame;
    const batchSize = 50; // Process 50 seek/draw operations before yielding
    
    for (let i = 0; i < framesInThisBatch; i++) {
      const globalFrameIndex = startFrame + i;
      const localFrameIndex = i;
      const timestamp = globalFrameIndex * this.interval;

      // Yield to main thread every few frames to prevent UI freeze
      if (i % batchSize === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (onProgress) {
          const percent = Math.round((globalFrameIndex / totalFrames) * 100);
          onProgress(percent, `Generating sprites... (${globalFrameIndex}/${totalFrames})`);
        }
      }

      await this.seekTo(timestamp);
      this.drawFrame(localFrameIndex);
      this.addVTTEntry(vttLines, globalFrameIndex, localFrameIndex, fileName, timestamp);
    }
  }

  private drawFrame(localFrameIndex: number) {
    const col = localFrameIndex % this.colCount;
    const row = Math.floor(localFrameIndex / this.colCount);
    const x = col * this.width;
    const y = row * this.height;
    
    // Draw video frame scaled to thumbnail size
    this.ctx.drawImage(this.video, x, y, this.width, this.height);
  }

  private addVTTEntry(
    vttLines: string[], 
    globalFrameIndex: number, 
    localFrameIndex: number, 
    fileName: string, 
    timestamp: number
  ) {
    const startTime = this.formatVTTTime(timestamp);
    const endTime = this.formatVTTTime(timestamp + this.interval);
    
    const col = localFrameIndex % this.colCount;
    const row = Math.floor(localFrameIndex / this.colCount);
    const x = col * this.width;
    const y = row * this.height;
    
    vttLines.push("");
    vttLines.push(`${startTime} --> ${endTime}`);
    vttLines.push(`${fileName}#xywh=${x},${y},${this.width},${this.height}`);
  }

  private loadVideoMetadata(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.video.readyState >= 1) {
        resolve();
        return;
      }
      const onLoad = () => {
        this.video.removeEventListener("loadedmetadata", onLoad);
        resolve();
      };
      this.video.addEventListener("loadedmetadata", onLoad);
      this.video.addEventListener("error", (e) => reject(e));
    });
  }

  private seekTo(time: number): Promise<void> {
    return new Promise((resolve) => {
      // Optimization: if time is beyond duration, clamp it? 
      // User requested seek to every 10s. If longer than duration, video will just hold last frame.
      
      const onSeeked = () => {
        this.video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      this.video.addEventListener("seeked", onSeeked);
      this.video.currentTime = time;
    });
  }

  private async canvasToBlob(): Promise<Blob> {
    if (this.canvas instanceof OffscreenCanvas) {
      return this.canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    } else {
      return new Promise<Blob>((resolve, reject) => {
        (this.canvas as HTMLCanvasElement).toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to Blob failed"));
        }, "image/jpeg", 0.8);
      });
    }
  }

  private formatVTTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}.${this.pad(ms, 3)}`;
  }

  private pad(num: number, length = 2): string {
    return num.toString().padStart(length, "0");
  }
}
