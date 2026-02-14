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

    const progressHandler = ({ progress }) => {
      onProgress?.(Math.round(progress * 100));
    };
    ffmpeg.on("progress", progressHandler);

    try {
      // For HLS (copy mode), writing the file is actually safer and fast enough
      onProgress?.(5);
      const fileData = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
      onProgress?.(10);

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
})();
