import { getAuthorizedVideoAccess } from "@/lib/video-access";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const auth = await getAuthorizedVideoAccess(
      lessonId,
      req.nextUrl.searchParams.get("v"),
    );

    if (auth.error) return auth.error;

    if (!auth.access!.videoEncryptionKey) {
      return new NextResponse("Video is not encrypted", { status: 404 });
    }

    // 3. Convert stored Base64 key back to 16-byte buffer
    const keyBuffer = Buffer.from(auth.access!.videoEncryptionKey, 'base64');

    // 4. Return the binary key with CORS headers
    return new NextResponse(keyBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": keyBuffer.length.toString(),
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
      }
    });

  } catch (error) {
    console.error("[Video Key API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
