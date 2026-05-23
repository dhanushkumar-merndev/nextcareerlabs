import { redis } from "./redis";
import { groq } from "@ai-sdk/groq";
import { streamText } from "ai";

const CHUNK_SIZE = 25000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function summarizeChunk(
  model: ReturnType<typeof groq>,
  chunk: Chunk,
  index: number,
  total: number,
): Promise<string> {
  const prompt = `This is chunk ${index + 1} of ${total} of a video transcript (${chunk.startTime} → ${chunk.endTime}). Extract the key facts below. Format each fact as a references list with its timestamp. Example:
- Naseer Hussain Patel is the trainer [00:07:35]
- Course is 70% practical [00:09:20]

TRANSCRIPT CHUNK:
${chunk.text}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let text = "";
      const result = streamText({
        model,
        system: "Extract key facts as a references list with timestamps. Each line: - fact [timestamp]",
        messages: [{ role: "user", content: prompt }],
      });
      for await (const part of result.textStream) {
        text += part;
      }
      return text;
    } catch (err) {
      const e = err as { statusCode?: number };
      const isRateLimit = e.statusCode === 429 || e.statusCode === 413;
      if (isRateLimit && attempt < 2) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return `[${chunk.startTime} → ${chunk.endTime}] (summary unavailable)`;
    }
  }
  return `[${chunk.startTime} → ${chunk.endTime}] (summary unavailable)`;
}

export interface ChunkSummary {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

interface Chunk {
  startTime: string;
  endTime: string;
  text: string;
}

function chunkVtt(vtt: string, maxChars: number): Chunk[] {
  const lines = vtt.split("\n");
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes("-->")) {
      const parts = trimmed.replace(/[\[\]]/g, "").split("-->");
      const start = parts[0]?.trim() || "";
      const end = parts[1]?.trim() || "";
      if (current && current.text.length > maxChars) {
        chunks.push(current);
        current = null;
      }
      if (!current) {
        current = { startTime: start, endTime: end, text: "" };
      } else {
        current.endTime = end;
      }
    } else if (current && trimmed) {
      current.text += trimmed + " ";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function getTranscriptSummaries(
  lessonId: string,
  vttText: string,
): Promise<ChunkSummary[]> {
  const vttHash = simpleHash(vttText);
  const cacheKey = `vtt:summary:${lessonId}`;
  const hashKey = `vtt:summary:${lessonId}:hash`;

  if (redis) {
    const [cachedHash, cached] = await Promise.all([
      redis.get(hashKey),
      redis.get(cacheKey),
    ]);
    if (cachedHash === vttHash && cached) {
      return JSON.parse(cached);
    }
  }

  const chunks = chunkVtt(vttText, CHUNK_SIZE);
  const summaries: ChunkSummary[] = [];

  const model = groq("meta-llama/llama-4-scout-17b-16e-instruct");

  let allSucceeded = true;
  for (let i = 0; i < chunks.length; i++) {
    const text = await summarizeChunk(model, chunks[i], i, chunks.length);
    summaries.push({ index: i, startTime: chunks[i].startTime, endTime: chunks[i].endTime, text });
    if (text.includes("(summary unavailable)")) allSucceeded = false;
    if (i < chunks.length - 1) await sleep(1000);
  }

  if (redis && allSucceeded) {
    await Promise.all([
      redis.set(cacheKey, JSON.stringify(summaries)),
      redis.set(hashKey, vttHash),
    ]);
  }

  return summaries;
}
