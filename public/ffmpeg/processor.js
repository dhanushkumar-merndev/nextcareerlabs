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

  // Combined HLS transcode + audio compression in a SINGLE FFmpeg session.
  // The input file is loaded into WASM memory once and reused for both operations,
  // saving 10-30s that would otherwise be spent re-initializing FFmpeg + re-reading the file.
  window.transcodeVideoToHLS = async function (file, onProgress, duration, encryption = null) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input.mp4";
    const hlsOutputName = "index.m3u8";
    const audioOutputName = "compressed.ogg";
    const keyInfoName = "enc.keyinfo";
    const keyFileName = "enc.key";

    let lastProgress = 0;
    const progressHandler = ({ progress }) => {
      // Scale to 5-70 range (HLS phase gets 70% of total progress)
      const current = Math.min(70, Math.round(5 + Math.min(1, progress) * 65));
      if (current > lastProgress) {
        lastProgress = current;
        onProgress?.(current);
      }
    };
    ffmpeg.on("progress", progressHandler);

    try {
      // Write file to WASM memory ONCE (this is the expensive part)
      onProgress?.(2);
      lastProgress = 2;
      const fileData = await file.arrayBuffer();
      await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
      onProgress?.(5);
      lastProgress = 5;

      const ffmpegArgs = [
        "-i", inputName,
        "-c", "copy",
        "-hls_time", "6", 
        "-hls_playlist_type", "vod",
        "-hls_flags", "single_file",
        "-f", "hls"
      ];

      // ✅ Phase 1: Byte-Range HLS (copy mode — very fast)
      // If encryption is provided, setup the key info file
      if (encryption && encryption.key && encryption.iv && encryption.keyUrl) {
        console.log("[Processor] HLS Encryption Enabled");
        // FFmpeg hls_key_info_file format:
        // Line 1: URL for the key (to be put in the .m3u8)
        // Line 2: Path to the local key file (in WASM mem)
        // Line 3: Initialization Vector (hex)
        const keyInfoContent = `${encryption.keyUrl}\n${keyFileName}\n${encryption.iv}`;
        await ffmpeg.writeFile(keyFileName, encryption.key); // encryption.key should be Uint8Array (16 bytes)
        await ffmpeg.writeFile(keyInfoName, keyInfoContent);
        
        ffmpegArgs.push("-hls_key_info_file", keyInfoName);
      }

      ffmpegArgs.push(hlsOutputName);
      await ffmpeg.exec(ffmpegArgs);

      onProgress?.(70);
      lastProgress = 70;

      const m3u8Data = await ffmpeg.readFile(hlsOutputName);
      const m3u8Blob = new Blob([m3u8Data], { type: "application/vnd.apple.mpegurl" });

      const segments = [];
      const files = await ffmpeg.listDir(".");
      for (const f of files) {
        if (f.name === "index.ts") {
          const data = await ffmpeg.readFile(f.name);
          segments.push({
            name: f.name,
            blob: new Blob([data], { type: "video/MP2T" }),
          });
        }
      }

      // ✅ Phase 2: Audio compression (reusing the already-loaded input file!)
      // No need to re-read the file — it's still in WASM memory from Phase 1.
      ffmpeg.off("progress", progressHandler);
      let audioLastProgress = 70;
      const audioProgressHandler = ({ progress }) => {
        // Scale to 70-95 range (audio phase gets 25% of total progress)
        const current = Math.min(95, Math.round(70 + Math.min(1, progress) * 25));
        if (current > audioLastProgress) {
          audioLastProgress = current;
          onProgress?.(current);
        }
      };
      ffmpeg.on("progress", audioProgressHandler);

      let audioBlob = null;
      try {
        await ffmpeg.exec([
          "-i", inputName,
          "-ar", "16000",
          "-ac", "1",
          "-b:a", "32k",
          "-vn",
          audioOutputName
        ]);

        const audioData = await ffmpeg.readFile(audioOutputName);
        audioBlob = new Blob([audioData], { type: "audio/ogg" });
        console.log(`[Processor] Audio compressed in-session: ${(audioBlob.size / 1024).toFixed(0)}KB`);
      } catch (audioErr) {
        console.warn("[Processor] In-session audio compression failed, non-fatal:", audioErr);
      }

      onProgress?.(100);

      return { m3u8: m3u8Blob, segments, audioBlob };
    } catch (err) {
      console.error("HLS: Error:", err);
      throw err;
    } finally {
      try { await ffmpeg.terminate(); } catch (e) {}
    }
  };

  // Standalone fallback — only used if audio wasn't extracted during HLS transcode
  window.compressAudio = async function (file, onProgress) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input_audio.mp4";
    const outputName = "compressed.ogg";

    let lastProgress = 0;
    const progressHandler = ({ progress }) => {
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
