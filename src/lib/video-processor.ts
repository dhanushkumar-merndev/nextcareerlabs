import "server-only";
import path from "path";
import os from "os";
import { tigris } from "@/lib/tigris";
import { env } from "@/lib/env";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs-extra");

// Simple in-memory progress tracking for local dev (using global to survive Fast Refresh)
const globalForProgress = global as unknown as { videoProgress: Map<string, number> };
export const videoProgress = globalForProgress.videoProgress || new Map<string, number>();
if (process.env.NODE_ENV !== "production") globalForProgress.videoProgress = videoProgress;

export function getVideoProgress(videoKey: string) {
  return videoProgress.get(videoKey) ?? 0;
}

/**
 * Transcodes a video from Tigris to HLS format and uploads the segments back to Tigris.
 * @param videoKey The key of the raw MP4 file in Tigris.
 */
export async function processVideoToHLS(encodedVideoKey: string) {
  const videoKey = decodeURIComponent(encodedVideoKey);
  console.log(`[PROCESSOR] Starting processVideoToHLS for: ${videoKey}`);
  console.log(`[PROCESSOR] FFmpeg loaded:`, typeof ffmpeg);
  console.log(`[PROCESSOR] fs loaded:`, typeof fs);

  const tempDir = path.join(os.tmpdir(), `nextcareerlabs-${Date.now()}`);
  await fs.ensureDir(tempDir);
  
  // Set initial progress
  videoProgress.set(videoKey, 1);

  try {
    const inputPath = path.join(tempDir, "input.mp4");
    const outputDir = path.join(tempDir, "hls");
    await fs.ensureDir(outputDir);
    const m3u8Path = path.join(outputDir, "master.m3u8");

    // 1. Get signed URL for raw video
    console.log(`[PROCESSOR] Accessing video: ${videoKey}`);
    const getCommand = new GetObjectCommand({
      Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
      Key: videoKey,
    });
    const url = await getSignedUrl(tigris, getCommand, { expiresIn: 3600 });
    
    // 2. Download the video to local temp file (FFmpeg on Windows can't handle signed HTTPS URLs directly)
    console.log(`[PROCESSOR] Downloading video to temp file...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(inputPath, Buffer.from(arrayBuffer));
    console.log(`[PROCESSOR] Downloaded to: ${inputPath}`);
    
    // 3. Transcode to HLS
    console.log(`[PROCESSOR] Transcoding to HLS...`);
    videoProgress.set(videoKey, 0);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-profile:v baseline",
          "-level 3.0",
          "-start_number 0",
          "-hls_time 10",
          "-hls_list_size 0",
          "-f hls"
        ])
        .output(m3u8Path)
        .on("start", (commandLine: any) => {
          console.log("FFmpeg started with: " + commandLine);
        })
        .on("progress", (progress: any) => {
          console.log(`[FFmpeg Progress] ${videoKey}:`, progress);
          if (progress.percent) {
            videoProgress.set(videoKey, Math.round(progress.percent));
          } else if (progress.timemark) {
            // Fallback: If percent is missing, at least we know it's moving
            // Note: We don't have total duration easily here, so we just set a non-zero value
            // or we could estimate if we had the duration metadata.
            const current = videoProgress.get(videoKey) ?? 0;
            if (current < 99) {
              videoProgress.set(videoKey, current + 1); 
            }
          }
        })
        .on("end", () => {
          console.log(`Transcoding finished for: ${videoKey}`);
          resolve();
        })
        .on("error", (err: any) => {
          videoProgress.delete(videoKey);
          console.error(`FFmpeg error for ${videoKey}:`, err);
          reject(err);
        })
        .run();
    });

    // 3. Upload HLS segments to Tigris
    const files = await fs.readdir(outputDir);
    const hlsFolderKey = `hls/${videoKey.replace(/\.[^/.]+$/, "")}`;

    console.log(`[PROCESSOR] Found ${files.length} HLS files to upload`);
    console.log(`[PROCESSOR] Uploading HLS segments to: ${hlsFolderKey}`);
    
    for (const file of files) {
      const filePath = path.join(outputDir, file);
      const fileBuffer = await fs.readFile(filePath); // Read as buffer instead of stream
      const uploadKey = `${hlsFolderKey}/${file}`;

      console.log(`[PROCESSOR] Uploading: ${uploadKey} (${fileBuffer.length} bytes)`);
      
      await tigris.send(
        new PutObjectCommand({
          Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
          Key: uploadKey,
          Body: fileBuffer,
          ContentType: file.endsWith(".m3u8") ? "application/x-mpegURL" : "video/MP2T",
          ACL: "public-read", // IMPORTANT: Make HLS segments public so player can access them
        })
      );
      
      console.log(`[PROCESSOR] ✓ Uploaded: ${uploadKey}`);
    }

    // Set progress to 100% only after all segments are uploaded
    videoProgress.set(videoKey, 100);

    // 4. Delete the original raw MP4 to save space
    console.log(`[PROCESSOR] Attempting to delete raw video: ${videoKey} from bucket: ${env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}`);
    try {
      const deleteResult = await tigris.send(
        new DeleteObjectCommand({
          Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
          Key: videoKey,
        })
      );
      console.log(`[PROCESSOR] ✓ Successfully deleted raw video: ${videoKey}`, deleteResult);
    } catch (deleteError: any) {
      console.warn(`[PROCESSOR] ✗ Failed to delete raw video ${videoKey}:`, deleteError.message);
    }

    return {
      success: true,
      hlsKey: `${hlsFolderKey}/master.m3u8`,
    };
  } catch (error) {
    console.error("Video processing failed:", error);
    throw error;
  } finally {
    // 4. Cleanup temp files
    await fs.remove(tempDir);
  }
}
