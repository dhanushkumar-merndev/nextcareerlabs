import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.includes("googleusercontent.com")) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  const res = await fetch(url, {
    next: { revalidate: 86400 },
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    return new NextResponse("Failed to fetch", { status: 502 });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
    },
  });
}
