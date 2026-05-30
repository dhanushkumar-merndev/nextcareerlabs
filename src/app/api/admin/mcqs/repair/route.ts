import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/redis";
import { env } from "@/lib/env";
import { generateMCQPrompt, parseMCQJSONLoose, validateMCQJSON } from "@/lib/mcq/mcq-prompt-generator";

export const runtime = "nodejs";
const MCQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

function parseGroqError(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Groq request failed";
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || session.user.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(`action:repairMCQs:${session.user.id}`, 8, 60);
    if (!rl.success) {
      return Response.json(
        { error: `Rate limit exceeded. Try again in ${rl.reset} seconds.` },
        { status: 429 },
      );
    }

    const body = (await req.json()) as {
      lessonTitle?: string;
      vttContent?: string;
      currentJson?: string;
    };

    if (!body.lessonTitle?.trim() || !body.vttContent?.trim() || !body.currentJson?.trim()) {
      return Response.json(
        { error: "Lesson title, transcript, and current JSON are required" },
        { status: 400 },
      );
    }

    const loose = parseMCQJSONLoose(body.currentJson);
    if (!loose.valid || !loose.questions?.length) {
      return Response.json(
        { error: loose.error || "Current MCQ JSON could not be parsed" },
        { status: 400 },
      );
    }

    const prompt = `${generateMCQPrompt(body.vttContent, body.lessonTitle, {
      maxTranscriptChars: 6000,
    })}

CURRENT GENERATED QUESTIONS (${loose.questions.length}/20):
${JSON.stringify({ questions: loose.questions }, null, 2)}

REPAIR TASK:
- Keep the existing valid questions unless they are duplicated or clearly wrong.
- Add enough new professional questions to make EXACTLY 20 total.
- Return the FULL corrected JSON object with all 20 questions, not only the missing questions.
- Preserve the same schema: { "questions": [...] }.
- Do not include markdown fences or commentary.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MCQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You repair LMS assessment JSON. Return only valid JSON with exactly 20 questions.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 5600,
        stream: false,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return Response.json(
        {
          error:
            payload?.error?.message ||
            `Groq MCQ repair failed with status ${response.status}`,
        },
        { status: response.status },
      );
    }

    const repairedJson = String(payload?.choices?.[0]?.message?.content || "");
    const validation = validateMCQJSON(repairedJson);
    if (!validation.valid) {
      return Response.json(
        { error: validation.error || "Repair did not produce valid 20-question JSON" },
        { status: 422 },
      );
    }

    return Response.json({
      json: JSON.stringify({ questions: validation.questions }, null, 2),
    });
  } catch (error) {
    console.error("[Repair MCQs API Error]", error);
    return Response.json(
      { error: parseGroqError(error) },
      { status: 500 },
    );
  }
}
