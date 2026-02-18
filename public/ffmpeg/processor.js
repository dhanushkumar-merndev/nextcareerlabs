(function () {
  async function createFFmpeg() {
    const { FFmpeg } = window.FFmpegWASM;
    const ffmpeg = new FFmpeg();

    await ffmpeg.load({
      coreURL: `${origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${origin}/ffmpeg/ffmpeg-core.wasm`,
      workerURL: `${origin}/ffmpeg/ffmpeg-core.worker.js`,
    });

    return ffmpeg;
  }

  window.transcodeVideoToHLS = async function (file, onProgress, duration) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input.mp4";
    const outputName = "index.m3u8";

    let lastProgress = 0;
    const progressHandler = ({ progress }) => {
      // Scale 0-100 to 10-100
      const current = Math.round(10 + progress * 90);
      if (current > lastProgress) {
        lastProgress = current;
        onProgress?.(current);
      }
    };
    ffmpeg.on("progress", progressHandler);

    try {
      // For HLS (copy mode), writing the file is actually safer and fast enough
      onProgress?.(5);
      lastProgress = 5;
      const fileData = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
      onProgress?.(10);
      lastProgress = 10;

      // ✅ Byte-Range HLS: Consolidates all segments into ONE single .ts file
      await ffmpeg.exec([
        "-i", inputName,
        "-c", "copy",
        "-hls_time", "6", 
        "-hls_playlist_type", "vod",
        "-hls_flags", "single_file",
        "-f", "hls",
        outputName
      ]);

      const m3u8Data = await ffmpeg.readFile(outputName);
      const m3u8Blob = new Blob([m3u8Data], { type: "application/vnd.apple.mpegurl" });

      const segments = [];
      const files = await ffmpeg.listDir(".");
      for (const f of files) {
        // In single_file mode, the segment is named exactly what's in the playlist (usually index.ts)
        if (f.name === "index.ts") {
          const data = await ffmpeg.readFile(f.name);
          segments.push({
            name: f.name,
            blob: new Blob([data], { type: "video/MP2T" }),
          });
        }
      }

      return { m3u8: m3u8Blob, segments };
    } catch (err) {
      console.error("HLS: Error:", err);
      throw err;
    } finally {
      try { await ffmpeg.terminate(); } catch (e) {}
    }
  };

  // Compress audio: 16kHz, mono, 32kbps OGG (tiny file for transcription)
  window.compressAudio = async function (file, onProgress) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input_audio.mp4";
    const outputName = "compressed.ogg";

    let lastProgress = 0;
    const progressHandler = ({ progress }) => {
      // Scale 0-100 to 10-100
      const current = Math.round(10 + progress * 90);
      if (current > lastProgress) {
        lastProgress = current;
        onProgress?.(current);
      }
    };
    ffmpeg.on("progress", progressHandler);

    try {
      onProgress?.(5);
      lastProgress = 5;
      const fileData = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
      onProgress?.(10);
      lastProgress = 10;

      await ffmpeg.exec([
        "-i", inputName,
        "-ar", "16000",
        "-ac", "1",
        "-b:a", "32k",
        "-vn",
        outputName
      ]);

      const audioData = await ffmpeg.readFile(outputName);
      onProgress?.(100);
      return new Blob([audioData], { type: "audio/ogg" });
    } catch (err) {
      console.error("Audio Compression Error:", err);
      throw err;
    } finally {
      try { await ffmpeg.terminate(); } catch (e) {}
    }
  };
})();
