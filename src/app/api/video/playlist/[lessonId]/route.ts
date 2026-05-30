import { env } from "@/lib/env";
import { tigris } from "@/lib/tigris";
import { getAuthorizedVideoAccess } from "@/lib/video-access";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIGNED_SEGMENT_URL_TTL_SECONDS = 6 * 60 * 60;

function getPlaylistMediaFile(line: string) {
  try {
    const parsed = new URL(line);
    return parsed.pathname.split("/").pop() || "index.ts";
  } catch {
    return line.split("?")[0]?.split("/").pop() || "index.ts";
  }
}

async function getSignedSegmentUrl(baseKey: string, file: string) {
  return getSignedUrl(
    tigris,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: `hls/${baseKey}/${file}`,
    }),
    { expiresIn: SIGNED_SEGMENT_URL_TTL_SECONDS },
  );
}

async function rewritePlaylist(
  playlist: string,
  keyUrl: string,
  baseKey: string,
) {
  const signedSegmentUrls = new Map<string, string>();
  const rewrittenLines = [];

  for (const line of playlist.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      rewrittenLines.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXT-X-KEY")) {
      rewrittenLines.push(line.replace(/URI="[^"]*"/, `URI="${keyUrl}"`));
      continue;
    }

    if (trimmed.startsWith("#")) {
      rewrittenLines.push(line);
      continue;
    }

    const file = getPlaylistMediaFile(trimmed);
    const cachedUrl = signedSegmentUrls.get(file);
    if (cachedUrl) {
      rewrittenLines.push(cachedUrl);
      continue;
    }

    const signedUrl = await getSignedSegmentUrl(baseKey, file);
    signedSegmentUrls.set(file, signedUrl);
    rewrittenLines.push(signedUrl);
  }

  return rewrittenLines.join("\n");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const auth = await getAuthorizedVideoAccess(
      lessonId,
      req.nextUrl.searchParams.get("v"),
    );
    if (auth.error) return auth.error;

    const baseKey = auth.access!.baseKey;
    const playlistKey = `hls/${baseKey}/master.m3u8`;

    const playlistObject = await tigris.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: playlistKey,
      }),
    );
    const playlist = await playlistObject.Body?.transformToString();

    if (!playlist) {
      return new NextResponse("Playlist not found", { status: 404 });
    }

    const keyParams = new URLSearchParams({ v: baseKey });
    const keyUrl = `${req.nextUrl.origin}/api/video/key/${lessonId}?${keyParams.toString()}`;
    const rewrittenPlaylist = await rewritePlaylist(playlist, keyUrl, baseKey);

    return new NextResponse(rewrittenPlaylist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[Video Playlist API Error]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
