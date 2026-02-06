(function () {
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

  window.transcodeVideoToHLS = async function (file, onProgress, duration) {
    const ffmpeg = await loadFFmpeg();

    const inputName = "input.mp4";
    const outputName = "index.m3u8";

    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.(Math.round(progress * 100));
    });

    // Write input file
    await ffmpeg.writeFile(
      inputName,
      new Uint8Array(await file.arrayBuffer())
    );

    // Calculate dynamic segment duration to target ~60 segments
    // Min 10s, Max 300s (5 mins)
    const TARGET_SEGMENTS = 200;

    // Min 2s, Max 30s (browser-safe)
    const hlsTime = Math.min(
      30,
      Math.max(2, Math.ceil(duration / TARGET_SEGMENTS))
    );

    console.log(`HLS segments target: ${TARGET_SEGMENTS}, hls_time: ${hlsTime}s`);


    // ✅ FASTEST POSSIBLE browser HLS
    await ffmpeg.exec([
      "-i", inputName,
      "-c", "copy",
      "-hls_time", hlsTime.toString(),
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", "segment%03d.ts",
      outputName
    ]);

    // Read playlist
    const m3u8Data = await ffmpeg.readFile(outputName);
    const m3u8Blob = new Blob([m3u8Data], {
      type: "application/vnd.apple.mpegurl",
    });

    // Read segments
    const segments = [];
    const files = await ffmpeg.listDir(".");

    for (const f of files) {
      if (f.name.endsWith(".ts")) {
        const data = await ffmpeg.readFile(f.name);
        segments.push({
          name: f.name,
          blob: new Blob([data], { type: "video/MP2T" }),
        });
        await ffmpeg.deleteFile(f.name);
      }
    }

    segments.sort((a, b) => a.name.localeCompare(b.name));

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    return { m3u8: m3u8Blob, segments };
  };
})();
