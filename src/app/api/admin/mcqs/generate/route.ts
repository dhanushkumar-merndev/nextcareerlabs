import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/redis";
import { generateMCQPromptFromSummary } from "@/lib/mcq/mcq-prompt-generator";
import { env } from "@/lib/env";

export const runtime = "nodejs";
const MCQ_MODEL = "qwen/qwen3-32b";
const SUMMARY_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

type GroqStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

type VttChunk = {
  startTime: string;
  endTime: string;
  text: string;
};

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; token: string }
  | { type: "error"; error: string }
  | { type: "done" };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkVttForMCQs(vtt: string, maxChars = 6500) {
  const lines = vtt.split("\n");
  const chunks: VttChunk[] = [];
  let current: VttChunk | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "WEBVTT" || /^\d+$/.test(trimmed)) continue;

    if (trimmed.includes("-->")) {
      const [start = "", end = ""] = trimmed.replace(/[\[\]]/g, "").split("-->");
      if (current && current.text.length >= maxChars) {
        chunks.push(current);
        current = null;
      }
      if (!current) {
        current = { startTime: start.trim(), endTime: end.trim(), text: "" };
      } else {
        current.endTime = end.trim();
      }
      continue;
    }

    if (!current) {
      current = { startTime: "00:00:00.000", endTime: "00:00:00.000", text: "" };
    }

    current.text += `${trimmed} `;
  }

  if (current?.text.trim()) chunks.push(current);
  return chunks.slice(0, 10);
}

function parseGroqError(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Groq request failed";
}

function getRetryDelayMs(message: string, fallbackMs = 9000) {
  const match = message.match(/try again in ([\d.]+)s/i);
  if (!match?.[1]) return fallbackMs;
  return Math.ceil(Number(match[1]) * 1000) + 500;
}

async function callGroq(body: Record<string, unknown>) {
  let lastError = "Groq request failed";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) return response;

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    lastError = payload?.error?.message || `Groq request failed with status ${response.status}`;

    if (response.status !== 429 || attempt === 2) {
      throw new Error(lastError);
    }

    await sleep(getRetryDelayMs(lastError));
  }

  throw new Error(lastError);
}

function enqueueEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
}

async function summarizeChunk(
  chunk: VttChunk,
  lessonTitle: string,
  index: number,
  total: number,
): Promise<string> {
  const response = await callGroq({
    model: SUMMARY_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Summarize this transcript chunk into concise study notes. Preserve key concepts, definitions, processes, examples, and important terms. Maximum 500 tokens. No JSON.",
      },
      {
        role: "user",
        content: `Lesson: ${lessonTitle}
Chunk ${index + 1}/${total} (${chunk.startTime} to ${chunk.endTime})

TRANSCRIPT CHUNK:
${chunk.text}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 700,
    stream: false,
  });

  const payload = await response.json();
  return String(payload?.choices?.[0]?.message?.content || "");
}

async function streamMCQs(
  controller: ReadableStreamDefaultController<Uint8Array>,
  lessonTitle: string,
  vttContent: string,
) {
  try {
    const chunks = chunkVttForMCQs(vttContent);
    const summaries: string[] = [];

    enqueueEvent(controller, {
      type: "status",
      message: `Summarizing ${chunks.length} transcript chunks...`,
    });

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      enqueueEvent(controller, {
        type: "status",
        message: `Summarizing chunk ${index + 1}/${chunks.length}...`,
      });

      const summary = await summarizeChunk(chunk, lessonTitle, index, chunks.length);

      summaries.push(`Chunk ${index + 1} (${chunk.startTime} to ${chunk.endTime})\n${summary.trim()}`);
      if (index < chunks.length - 1) await sleep(300);
    }

    const combinedSummary = summaries.join("\n\n").slice(0, 6000);
    enqueueEvent(controller, {
      type: "status",
      message: "Generating 20 MCQs with Qwen...",
    });

    const groqResponse = await callGroq({
      model: MCQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You generate professional LMS assessment JSON. Return only valid JSON. No markdown fences or commentary. You must output exactly 20 questions.",
        },
        {
          role: "user",
          content: generateMCQPromptFromSummary(combinedSummary, lessonTitle),
        },
      ],
      temperature: 0.15,
      max_tokens: 4000,
      stream: true,
    });

    if (!groqResponse.body) {
      throw new Error("Groq MCQ generation did not return a stream");
    }

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let jsonStarted = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        const parsed = JSON.parse(data) as GroqStreamChunk;
        let content = parsed.choices?.[0]?.delta?.content;
        if (!content) continue;

        if (!jsonStarted) {
          const jsonStart = content.indexOf("{");
          if (jsonStart === -1) continue;
          jsonStarted = true;
          content = content.slice(jsonStart);
        }

        enqueueEvent(controller, { type: "token", token: content });
      }
    }

    enqueueEvent(controller, { type: "done" });
  } catch (error) {
    console.error("[MCQ Stream Error]", error);
    enqueueEvent(controller, { type: "error", error: parseGroqError(error) });
  } finally {
    controller.close();
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || session.user.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(`action:generateMCQs:${session.user.id}`, 5, 60);
    if (!rl.success) {
      return Response.json(
        { error: `Rate limit exceeded. Try again in ${rl.reset} seconds.` },
        { status: 429 },
      );
    }

    const body = (await req.json()) as {
      lessonTitle?: string;
      vttContent?: string;
    };

    if (!body.lessonTitle?.trim() || !body.vttContent?.trim()) {
      return Response.json(
        { error: "Lesson title and transcript are required" },
        { status: 400 },
      );
    }

    const readable = new ReadableStream({
      async start(controller) {
        await streamMCQs(controller, body.lessonTitle!, body.vttContent!);
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[Generate MCQs API Error]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate MCQs" },
      { status: 500 },
    );
  }
}
