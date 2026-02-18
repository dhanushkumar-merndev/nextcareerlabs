export interface SpriteGenerationResult {
  vttBlob: Blob;
  combinedBlob: Blob;
  spriteFileName: string;
  vttLinesRaw: string[];
  previewLowBlob?: Blob; // Added for progressive loading
}

export type ProgressCallback = (progress: number, status: string) => void;

export class SpriteGenerator {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private width: number;
  private height: number;
  public readonly interval: number; // seconds
  private colCount: number;
  private rowCount: number; // max rows per sheet (calculated from max frames per sheet)
 

  constructor(
    width = 240,     // Increased from 160px for better visibility
    height = 135,    // Increased from 90px (maintains 16:9 ratio)
    interval = 10,
    colCount = 10     // Updated to 10 columns as requested
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

  public async generate(
    file: File, 
    onProgress?: ProgressCallback,
    timeRange?: { start: number; end: number }
  ): Promise<SpriteGenerationResult> {
    const objectUrl = URL.createObjectURL(file);
    this.video.src = objectUrl;

    try {
      await this.loadVideoMetadata();
      const duration = this.video.duration;
      
      const startTimestamp = timeRange?.start ?? 0;
      const endTimestamp = timeRange?.end ?? duration;
      
      const startFrameIndex = Math.floor(startTimestamp / this.interval);
      const endFrameIndex = Math.ceil(endTimestamp / this.interval);
      const totalFramesToProcess = endFrameIndex - startFrameIndex;
      
      const spriteBlobs: Blob[] = [];
      const vttLines: string[] = []; 
      
      if (!timeRange || timeRange.start === 0) {
        vttLines.push("WEBVTT", "");
      }

      // Max frames per sheet to keep size reasonable and improve seeking performance
      // Using 25 allows for better densitity while keeping individual canvases manageable
      const maxFramesPerSheet = 25; 
      const totalSheets = Math.ceil(totalFramesToProcess / maxFramesPerSheet);
      
      let currentOffset = 0;
      const binaryFileName = "sprites.bin";

      for (let s = 0; s < totalSheets; s++) {
        const sheetStartFrame = startFrameIndex + (s * maxFramesPerSheet);
        const sheetEndFrame = Math.min(sheetStartFrame + maxFramesPerSheet, endFrameIndex);
        const framesInThisSheet = sheetEndFrame - sheetStartFrame;

        const rows = Math.ceil(framesInThisSheet / this.colCount);
        const sheetWidth = this.colCount * this.width;
        const sheetHeight = rows * this.height;

        this.configureCanvas(sheetWidth, sheetHeight);

        // Fill background
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, sheetWidth, sheetHeight);
        
        // Draw frames to canvas
        for (let i = 0; i < framesInThisSheet; i++) {
          const globalFrameIndex = sheetStartFrame + i;
          const timestamp = globalFrameIndex * this.interval;
          
          if (globalFrameIndex % 5 === 0 && onProgress) {
             const processed = globalFrameIndex - startFrameIndex;
             // Give 85% weight to high-res generation
             const percent = Math.round((processed / totalFramesToProcess) * 85);
             onProgress(Math.min(85, percent), `Generating snapshots...`);
          }

          await this.seekTo(timestamp);
          this.drawFrame(i);
        }

        const blob = await this.canvasToBlob();
        const startOffset = currentOffset;
        const endOffset = currentOffset + blob.size - 1;
        
        // After blob is generated, we know the EXACT range for these frames
        for (let i = 0; i < framesInThisSheet; i++) {
            const globalFrameIndex = sheetStartFrame + i;
            const timestamp = globalFrameIndex * this.interval;
            this.addVTTEntry(vttLines, i, `${binaryFileName}#range=${startOffset}-${endOffset}`, timestamp);
        }

        spriteBlobs.push(blob);
        currentOffset += blob.size;
      }
      
      const combinedBlob = new Blob(spriteBlobs, { type: "application/octet-stream" });
      const vttContent = vttLines.join("\n");
      const vttBlob = new Blob([vttContent], { type: "text/vtt" });

      // Generate Low-Res Master Grid — INLINE to reuse the already-loaded video element.
      // No second URL.createObjectURL or loadVideoMetadata needed.
      const lowResInterval = Math.max(this.interval, 10); // Cap at 10s min for low-res (saves tons of seeks)
      const lowResDuration = this.video.duration;
      const lowResTotalFrames = Math.ceil(lowResDuration / lowResInterval);
      const lowWidth = 40;
      const lowHeight = 22;
      const lowCols = 25;
      const lowRows = Math.ceil(lowResTotalFrames / lowCols);

      this.configureCanvas(lowCols * lowWidth, lowRows * lowHeight);
      this.ctx.fillStyle = "black";
      this.ctx.fillRect(0, 0, lowCols * lowWidth, lowRows * lowHeight);

      for (let i = 0; i < lowResTotalFrames; i++) {
        const timestamp = i * lowResInterval;
        if (i % 10 === 0 && onProgress) {
          const cumulative = 85 + ((i / lowResTotalFrames) * 14);
          onProgress(Math.min(99, Math.round(cumulative)), `Optimizing previews...`);
        }
        await this.seekTo(timestamp);
        const col = i % lowCols;
        const row = Math.floor(i / lowCols);
        this.ctx.drawImage(this.video, col * lowWidth, row * lowHeight, lowWidth, lowHeight);
      }

      const lowResBlob = await this.canvasToBlob(0.4);

      if (onProgress) onProgress(100, "Done!");

      return {
        vttBlob,
        combinedBlob,
        spriteFileName: binaryFileName,
        vttLinesRaw: vttLines,
        previewLowBlob: lowResBlob
      }; 

    } finally {
      URL.revokeObjectURL(objectUrl);
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      if (typeof this.video.remove === "function") this.video.remove();
    }
  }

  /**
   * Generates a single, ultra-low resolution grid for the entire video.
   * This is used as an instant blurred placeholder.
   */
  public async generateLowResGrid(
    file: File,
    interval: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const objectUrl = URL.createObjectURL(file);
    this.video.src = objectUrl;

    try {
      await this.loadVideoMetadata();
      const duration = this.video.duration;
      const totalFrames = Math.ceil(duration / interval);
      
      const lowWidth = 40;
      const lowHeight = 22;
      const lowCols = 25;
      const lowRows = Math.ceil(totalFrames / lowCols);
      
      this.configureCanvas(lowCols * lowWidth, lowRows * lowHeight);
      this.ctx.fillStyle = "black";
      this.ctx.fillRect(0, 0, lowCols * lowWidth, lowRows * lowHeight);

      for (let i = 0; i < totalFrames; i++) {
        const timestamp = i * interval;
        
        if (i % 10 === 0 && onProgress) {
            onProgress((i / totalFrames) * 100);
        }

        await this.seekTo(timestamp);
        
        const col = i % lowCols;
        const row = Math.floor(i / lowCols);
        this.ctx.drawImage(this.video, col * lowWidth, row * lowHeight, lowWidth, lowHeight);
      }

      if (onProgress) onProgress(100);

      return await this.canvasToBlob(0.4); // Very low quality for instant load
    } finally {
      URL.revokeObjectURL(objectUrl);
      this.video.pause();
    }
  }

  private configureCanvas(width: number, height: number) {
        if (this.canvas instanceof OffscreenCanvas) {
            this.canvas.width = width;
            this.canvas.height = height;
        } else {
            (this.canvas as HTMLCanvasElement).width = width;
            (this.canvas as HTMLCanvasElement).height = height;
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

  // --- Static Parallel Processing ---

  static async generateParallel(
    file: File, 
    concurrency = 4,
    onProgress?: (progress: number) => void
  ): Promise<SpriteGenerationResult> {
    
    // 1. Get Duration
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    tempVideo.src = objectUrl;
    
    await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onerror = (e) => reject(e);
    });
    const duration = tempVideo.duration;
    URL.revokeObjectURL(objectUrl); // Clean up temp

    // 2. Split Duration
    const chunkDuration = Math.ceil(duration / concurrency);
    const generators: SpriteGenerator[] = [];
    const promises: Promise<any>[] = [];
    
    // Track progress of each chunk
    const progressMap = new Array(concurrency).fill(0);
    
    for (let i = 0; i < concurrency; i++) {
        const gen = new SpriteGenerator();
        generators.push(gen);
        
        const start = i * chunkDuration;
        const end = Math.min((i + 1) * chunkDuration, duration);
        
        if (start >= duration) continue; // Skip empty chunks

        promises.push(gen.generate(file, (p) => {
            progressMap[i] = p;
            const totalP = Math.round(progressMap.reduce((a, b) => a + b, 0) / concurrency);
            onProgress?.(totalP);
        }, { start, end }));
    }

    // 3. Wait for all
    const results = await Promise.all(promises);

    // 4. Merge Results
    const finalVTTLines = ["WEBVTT", ""];
    const finalBlobs: Blob[] = [];

    results.forEach((res) => {
        const lines = (res.vttLinesRaw || []).filter((l: string) => l !== "WEBVTT" && l !== "");
        finalVTTLines.push(...lines);
        finalBlobs.push(res.combinedBlob);
    });

    const mergedVTTContent = finalVTTLines.join("\n");
    const mergedVTTBlob = new Blob([mergedVTTContent], { type: "text/vtt" });
    const mergedCombinedBlob = new Blob(finalBlobs, { type: "application/octet-stream" });

    // 5. Generate Low-Res Master Grid
    const lowResGen = new SpriteGenerator();
    const lowResBlob = await lowResGen.generateLowResGrid(file, generators[0].interval, (p) => {
        // Late stage progress 95% -> 100%
        onProgress?.(95 + (p * 0.05));
    });

    onProgress?.(100);

    // 6. Cleanup: Null out chunk references so GC can reclaim them
    results.length = 0;

    return {
        vttBlob: mergedVTTBlob,
        combinedBlob: mergedCombinedBlob,
        spriteFileName: "sprites.bin",
        vttLinesRaw: finalVTTLines,
        previewLowBlob: lowResBlob
    };
  }

  // ... (keep private methods: drawFrame, loadVideoMetadata, seekTo, canvasToBlob, formatVTTTime, pad)

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
      let resolved = false;
      const onSeeked = () => {
        if (resolved) return;
        resolved = true;
        this.video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      
      // Safety timeout: reduced from 2000ms to 500ms.
      // Most browsers fire 'seeked' within 50-200ms. The old 2s timeout added
      // minutes of dead time on videos with hundreds of frames.
      setTimeout(() => {
        if (!resolved) {
            resolved = true;
            this.video.removeEventListener("seeked", onSeeked);
            resolve();
        }
      }, 500);

      this.video.addEventListener("seeked", onSeeked);
      this.video.currentTime = time;
    });
  }

  private async canvasToBlob(quality = 0.5): Promise<Blob> {
    if (this.canvas instanceof OffscreenCanvas) {
      return this.canvas.convertToBlob({ type: "image/jpeg", quality });
    } else {
      return new Promise<Blob>((resolve, reject) => {
        (this.canvas as HTMLCanvasElement).toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to Blob failed"));
        }, "image/jpeg", quality);
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
