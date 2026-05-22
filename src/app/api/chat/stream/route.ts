import { NextRequest } from "next/server";
import { streamText } from "ai";
import { groq } from "@ai-sdk/groq";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { checkChatQuota } from "@/lib/chat-limits";
import { getTranscriptSummaries } from "@/lib/transcript-summary";

const models = [
  groq("meta-llama/llama-4-scout-17b-16e-instruct"),
  groq("qwen/qwen3-32b"),
  groq("openai/gpt-oss-120b"),
  groq("openai/gpt-oss-20b"),
  groq("llama-3.3-70b-versatile"),
];

if (!env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set");
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { messages, lessonId, vttText } = await req.json();
    if (!messages?.length || !lessonId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        Chapter: {
          select: {
            Course: {
              select: { isFree: true, title: true },
            },
          },
        },
      },
    });

    if (!lesson) {
      return new Response(JSON.stringify({ error: "Lesson not found" }), { status: 404 });
    }

    const isFreeUser = lesson.Chapter.Course.isFree;

    const quota = await checkChatQuota(session.user.id, isFreeUser);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.reason }), { status: 429 });
    }

    // Generate chunk summaries (not counted against user quota — system overhead)
    let contextText = "";
    if (vttText) {
      const summaries = await getTranscriptSummaries(lessonId, vttText);
      contextText = summaries.map((s) => s.text).join("\n");
    }

    let systemPrompt = `You are a helpful course assistant for the course "${lesson.Chapter.Course.title}". You are watching a video and answering based on its transcript.

CRITICAL: For EVERY piece of information you reference, you MUST cite the timestamp [HH:MM:SS]. Do NOT put timestamps inline in sentences. Instead, add a "## References" section at the very bottom of your response. Example:

## References
- Vishwanath M. Patel is the moderator [00:01:06]
- Naseer Hussain Patel is the trainer, 7 years DevOps experience [00:07:35]
- Course is 70% practical / 30% theoretical [00:09:20]

Keep responses concise and educational.

When the user asks for a summary or formatted output, follow these rules:
- Use ## for major sections, ### for subsections
- Add a title at the top
- Use --- horizontal dividers between major sections
- Merge all speaker/people info into ONE table with columns: Role, Name, Background
- Never repeat the same person across sections
- Group related points together into meaningful bullets (no single-line shallow bullets)
- Extract course structure visually (e.g. 70% practical / 30% theory)
- Bold key numbers, years of experience, and notable achievements
- Merge sections that talk about the same topic or person
- Remove filler phrases like "the session aims to" or "he explains that"
- Use markdown tables where appropriate`;

    if (contextText) {
      systemPrompt += `\n\n=== TRANSCRIPT SUMMARIES ===\n${contextText}\n=== END SUMMARIES ===`;
    }

    const userMessages = messages.filter((m: any) => m.role !== "system");

    const result = streamText({
      model: models[0],
      system: systemPrompt,
      messages: userMessages,
      temperature: 0.7,
      maxOutputTokens: 1024,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
