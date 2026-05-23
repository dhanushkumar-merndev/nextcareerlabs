import { NextRequest, NextResponse } from "next/server";

const ALLOWED_DOMAINS = [
  "googleusercontent.com",
  "lh3.googleusercontent.com",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (!parsed.protocol.startsWith("https")) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  const isAllowed = ALLOWED_DOMAINS.some(
    (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`),
  );
  if (!isAllowed) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  const res = await fetch(parsed.href, {
    next: { revalidate: 86400 },
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(5000),
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
