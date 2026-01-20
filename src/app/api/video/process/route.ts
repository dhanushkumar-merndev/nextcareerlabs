import { processVideoToHLS } from "@/lib/video-processor";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/data/admin/require-admin";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { videoKey } = await request.json();

    if (!videoKey) {
      return NextResponse.json({ error: "videoKey is required" }, { status: 400 });
    }

    console.log(`[VIDEO API] Processing video: ${videoKey}`);

    // Process in background so API responds immediately and user sees progress
    processVideoToHLS(videoKey)
      .then((result) => {
        console.log(`[VIDEO API] ✓ Processing completed for ${videoKey}:`, result.hlsKey);
      })
      .catch((error) => {
        console.error(`[VIDEO API] ✗ Processing failed for ${videoKey}:`, error);
      });
    
    return NextResponse.json({
      message: "Video processing started",
      hlsKey: `hls/${videoKey.replace(/\.[^/.]+$/, "")}/master.m3u8`,
    });
  } catch (error: any) {
    console.error("[VIDEO API] ✗ Processing error:", error);
    return NextResponse.json({ 
      error: "Processing failed", 
      details: error.message 
    }, { status: 500 });
  }
}
