import { NextResponse } from "next/server";

export async function GET() {
  try {
    const ffmpeg = require("fluent-ffmpeg");
    const fs = require("fs-extra");
    
    return NextResponse.json({
      ffmpegLoaded: typeof ffmpeg,
      fsLoaded: typeof fs,
      message: "Modules loaded successfully"
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
