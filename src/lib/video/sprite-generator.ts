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
    width = 240,     // Increased from 160px for better visibility
    height = 135,    // Increased from 90px (maintains 16:9 ratio)
    interval = 10,
    colCount = 5     // 5 cols * 240 = 1200px wide
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
      
      // Calculate global frame indices
      // We align startTimestamp to the nearest interval to avoid drift
      const startFrameIndex = Math.floor(startTimestamp / this.interval);
      const endFrameIndex = Math.ceil(endTimestamp / this.interval);
      const totalFramesToProcess = endFrameIndex - startFrameIndex;
      
      // Strategy: 1 Sprite Sheet per hour of video (360 frames)
      const framesPerSheet = 360; 
      
      // We need to offset the sheet index if we are processing a chunk
      // relativeSheetIndex 0 corresponds to the first sheet *of this chunk*
      // But we want output filenames to be consistent globally? 
      // Actually, if we merge later, we can just return blobs and let the merger handle naming?
      // No, best to have unique names. "sprite-<timestamp>-<index>.jpg"?
      // Or just return ordered list of blobs and generic names, then rename on merge.
      
      const chunkSheetCount = Math.ceil(totalFramesToProcess / framesPerSheet);
      
      const spriteBlobs: Blob[] = [];
      const spriteFileNames: string[] = [];
      const vttLines: string[] = []; // We won't add header here if merging, but for single run we might.
      
      // Only add header if this is a standalone run (no range) or the start
      if (!timeRange || timeRange.start === 0) {
        vttLines.push("WEBVTT", "");
      }

      for (let i = 0; i < chunkSheetCount; i++) {
        // Global frame numbers for this sheet
        const sheetStartFrame = startFrameIndex + (i * framesPerSheet);
        const sheetEndFrame = Math.min(startFrameIndex + ((i + 1) * framesPerSheet), endFrameIndex);
        
        // Calculate canvas dimensions
        const framesInSheet = sheetEndFrame - sheetStartFrame;
        const rows = Math.ceil(framesInSheet / this.colCount);
        const sheetWidth = this.colCount * this.width;
        const sheetHeight = rows * this.height;

        this.configureCanvas(sheetWidth, sheetHeight);

        // Fill background
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, sheetWidth, sheetHeight);
        
        // Use a unique name to avoid collision in parallel uploads if we used that
        // But for consistency: "sprite-<startFrame>.jpg" is safe
        const fileName = `sprite-${sheetStartFrame}.jpg`;
        spriteFileNames.push(fileName);
        
        await this.processBatch(
          sheetStartFrame, 
          sheetEndFrame, 
          fileName, 
          vttLines, 
          onProgress, 
          totalFramesToProcess, // logical total for this generator's progress
          startFrameIndex // logical zero for progress calc
        );

        const blob = await this.canvasToBlob();
        spriteBlobs.push(blob);
        
        this.ctx.clearRect(0, 0, sheetWidth, sheetHeight);
      }

      const vttContent = vttLines.join("\n");
      const vttBlob = new Blob([vttContent], { type: "text/vtt" });

      return {
        vttBlob,
        spriteBlobs,
        spriteFileNames,
        vttLinesRaw: vttLines // Return raw lines for merging
      } as any; 

    } finally {
      URL.revokeObjectURL(objectUrl);
      this.video.removeAttribute("src");
      this.video.load();
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

  private async processBatch(
    startFrame: number, 
    endFrame: number, 
    fileName: string, 
    vttLines: string[], 
    onProgress: ProgressCallback | undefined,
    totalFrames: number,
    baseFrameIndex: number
  ) {
    const count = endFrame - startFrame;
    const batchSize = 50;
    
    for (let i = 0; i < count; i++) {
      const globalFrameIndex = startFrame + i;
      // Local index relative to THIS sheet
      const sheetLocalFrameIndex = i; 
      const timestamp = globalFrameIndex * this.interval;

      if (i % batchSize === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (onProgress) {
            // Progress relative to this chunk
            const processed = globalFrameIndex - baseFrameIndex;
            const percent = Math.round((processed / totalFrames) * 100);
            onProgress(percent, `Generating part...`);
        }
      }

      await this.seekTo(timestamp);
      this.drawFrame(sheetLocalFrameIndex);
      this.addVTTEntry(vttLines, sheetLocalFrameIndex, fileName, timestamp);
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
    const finalFileNames: string[] = [];

    // Sort results by start time (implicitly handled by array order 0..3)
    results.forEach((res) => {
        // Filter out existing WEBVTT headers if any sub-gen added them
        const lines = (res.vttLinesRaw || []).filter((l: string) => l !== "WEBVTT" && l !== "");
        finalVTTLines.push(...lines);
        
        finalBlobs.push(...res.spriteBlobs);
        finalFileNames.push(...res.spriteFileNames);
    });

    const mergedVTTContent = finalVTTLines.join("\n");
    const mergedVTTBlob = new Blob([mergedVTTContent], { type: "text/vtt" });

    return {
        vttBlob: mergedVTTBlob,
        spriteBlobs: finalBlobs,
        spriteFileNames: finalFileNames
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
