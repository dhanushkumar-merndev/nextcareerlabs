(function () {
  const MAX_HLS_SEGMENTS = 200;
  const MIN_HLS_SEGMENT_SECONDS = 6;

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

  function getHlsSegmentTime(duration) {
    const durationInSeconds = Number(duration);

    if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0) {
      return String(MIN_HLS_SEGMENT_SECONDS);
    }

    return String(
      Math.max(
        MIN_HLS_SEGMENT_SECONDS,
        Math.ceil(durationInSeconds / MAX_HLS_SEGMENTS),
      ),
    );
  }

  async function prepareInput(ffmpeg, file, fallbackName) {
    try {
      try { await ffmpeg.createDir("/input"); } catch {}
      await ffmpeg.mount("WORKERFS", { files: [file] }, "/input");
      return {
        inputPath: `/input/${file.name}`,
        mounted: true,
      };
    } catch (mountErr) {
      console.warn("[Processor] WORKERFS mount failed, falling back to MEMFS:", mountErr);
      const fileData = await file.arrayBuffer();
      await ffmpeg.writeFile(fallbackName, new Uint8Array(fileData));
      return {
        inputPath: fallbackName,
        mounted: false,
      };
    }
  }

  async function cleanupInput(ffmpeg, mounted, fallbackName) {
    if (mounted) {
      try { await ffmpeg.unmount("/input"); } catch {}
      return;
    }

    try { await ffmpeg.deleteFile(fallbackName); } catch {}
  }

  // Combined HLS packaging + audio compression in a SINGLE FFmpeg session.
  // WORKERFS avoids copying the source video into WASM memory, while segmented
  // HLS avoids creating one huge .ts blob that can trigger browser/WASM overflow.
  window.transcodeVideoToHLS = async function (file, onProgress, duration, encryption = null) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input.mp4";
    const hlsOutputName = "index.m3u8";
    const segmentPattern = "segment_%05d.ts";
    const audioOutputName = "compressed.ogg";
    const keyInfoName = "enc.keyinfo";
    const keyFileName = "enc.key";
    let inputPath = inputName;
    let mountedInput = false;

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
      onProgress?.(2);
      lastProgress = 2;
      const preparedInput = await prepareInput(ffmpeg, file, inputName);
      inputPath = preparedInput.inputPath;
      mountedInput = preparedInput.mounted;
      onProgress?.(5);
      lastProgress = 5;
      const hlsSegmentTime = getHlsSegmentTime(duration);

      const ffmpegArgs = [
        "-i", inputPath,
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",
        "-ar", "48000",
        "-sn",
        "-dn",
        "-max_muxing_queue_size", "1024",
        "-hls_time", hlsSegmentTime,
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", segmentPattern,
        "-f", "hls"
      ];

      // Phase 1: segmented HLS with playable AAC audio.
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
      const segmentFiles = files
        .filter((f) => !f.isDir && /^segment_\d+\.ts$/.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const f of segmentFiles) {
        try {
          const data = await ffmpeg.readFile(f.name);
          segments.push({
            name: f.name,
            blob: new Blob([data], { type: "video/MP2T" }),
          });
          await ffmpeg.deleteFile(f.name);
        } catch (segmentErr) {
          console.warn(`[Processor] Failed reading HLS segment ${f.name}:`, segmentErr);
          throw segmentErr;
        }
      }

      if (segments.length === 0) {
        throw new Error("HLS processing did not produce any playable segments");
      }

      // Phase 2: sidecar audio compression for transcription workflows.
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
          "-i", inputPath,
          "-map", "0:a:0",
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
      await cleanupInput(ffmpeg, mountedInput, inputName);
      try { await ffmpeg.terminate(); } catch {}
    }
  };

  // Standalone fallback — only used if audio wasn't extracted during HLS transcode
  window.compressAudio = async function (file, onProgress) {
    const ffmpeg = await createFFmpeg();
    const inputName = "input_audio.mp4";
    const outputName = "compressed.ogg";
    let inputPath = inputName;
    let mountedInput = false;

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
      const preparedInput = await prepareInput(ffmpeg, file, inputName);
      inputPath = preparedInput.inputPath;
      mountedInput = preparedInput.mounted;
      onProgress?.(10);
      lastProgress = 10;

      await ffmpeg.exec([
        "-i", inputPath,
        "-map", "0:a:0",
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
      await cleanupInput(ffmpeg, mountedInput, inputName);
      try { await ffmpeg.terminate(); } catch {}
    }
  };
})();
