import { videoProgress } from "@/lib/video-processor";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoKey = searchParams.get("videoKey");

  if (!videoKey) {
    return NextResponse.json({ error: "videoKey is required" }, { status: 400 });
  }

  const progress = videoProgress.get(videoKey) ?? 0;

  return NextResponse.json({
    progress,
    isComplete: progress === 100,
  });
}
