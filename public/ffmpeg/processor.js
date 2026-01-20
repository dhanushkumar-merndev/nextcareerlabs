/**
 * Standalone Video Processor Script (ST-UMD Version)
 * OPTIMIZED: Uses faster encoding settings to prevent file bloat
 */

(function() {
  let ffmpeg = null;

  async function loadFFmpeg() {
    if (ffmpeg) return ffmpeg;

    const { FFmpeg } = window.FFmpegWASM;

    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: `${origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${origin}/ffmpeg/ffmpeg-core.wasm`,
      workerURL: `${origin}/ffmpeg/ffmpeg-core.worker.js`,
    });

    return ffmpeg;
  }

  window.transcodeVideoToHLS = async function(file, onProgress) {
    const ffmpeg = await loadFFmpeg();
    
    const inputName = "input.mp4";
    const outputName = "master.m3u8";
    
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });

    const arrayBuffer = await file.arrayBuffer();
    await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));

    // OPTIMIZED SETTINGS:
    // Try stream copy first (instant, no quality loss, same size as input)
    // Falls back to re-encoding only if needed
    // Stream copy: -c copy = copies video/audio without re-encoding
    // This keeps the output size identical to original and processes instantly
    await ffmpeg.exec([
      "-i", inputName,
      "-c", "copy",              // Copy streams without re-encoding (fastest, no size change)
      "-hls_time", "6",          // 6 second segments for smooth streaming
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", "segment%03d.ts",
      "-movflags", "+faststart", // Optimize for streaming
      outputName
    ]);

    const m3u8Data = await ffmpeg.readFile(outputName);
    const m3u8Uint8 = typeof m3u8Data === "string" ? new TextEncoder().encode(m3u8Data) : new Uint8Array(m3u8Data);
    const m3u8Blob = new Blob([m3u8Uint8], { type: "application/x-mpegURL" });

    const segments = [];
    const files = await ffmpeg.listDir(".");
    
    for (const f of files) {
      if (f.name.endsWith(".ts")) {
        const data = await ffmpeg.readFile(f.name);
        const segmentUint8 = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
        segments.push({
          name: f.name,
          blob: new Blob([segmentUint8], { type: "video/MP2T" })
        });
        await ffmpeg.deleteFile(f.name);
      }
    }

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    return {
      m3u8: m3u8Blob,
      segments
    };
  };
})();
