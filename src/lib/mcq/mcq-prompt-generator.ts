/**
 * Generate AI prompt from transcription to create MCQs
 */
export function generateMCQPrompt(
  vttContent: string,
  lessonTitle: string,
  options?: { maxTranscriptChars?: number },
): string {
  // Extract plain text from VTT (remove timestamps)
  const plainText = options?.maxTranscriptChars
    ? compactText(extractTextFromVTT(vttContent), options.maxTranscriptChars)
    : extractTextFromVTT(vttContent);

  return `Generate exactly 20 multiple-choice questions based on this lesson transcription.

LESSON: ${lessonTitle}

TRANSCRIPTION:
${plainText}

REQUIREMENTS:
- Create 20 questions that test comprehensive understanding of what was taught
- STRICT SOURCING: Questions must be answerable ONLY using the information provided in the TRANSCRIPTION. 
- AVOID EXTERNAL KNOWLEDGE: Do not include facts, definitions, or context from outside this specific video recording.
- Each question must have exactly 4 options (A, B, C, D)
- Only ONE correct answer per question
- Include very brief explanations for correct answers
- Cover key concepts, definitions, and important details from the transcription
- Difficulty distribution: 10 simple, 5 medium, 5 tough
- STRICT INDEX RANDOMIZATION: The \`correctIdx\` must be varied. AVOID repeating the same correct index for consecutive questions (e.g., if Q1 is 0, Q2 should be 1, 2, or 3).
- Ensure an even distribution of correct indices (0, 1, 2, 3) across the 20 questions (e.g., roughly 5 questions for each index position).
- Questions should be in logical order following the lesson flow
- Focus strictly on the educational topic and core concepts being taught
- AVOID questions about the company, trainer's background, or administrative details
- Avoid overly trivial questions

OUTPUT FORMAT (Valid JSON only):
{
  "questions": [
    {
      "question": "What is the main concept discussed in...",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correctIdx": 0,
      "explanation": "Brief explanation of why this is correct..."
    },
    {
      "question": "According to the lesson, how does...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIdx": 2,
      "explanation": "Explanation here..."
    }
  ]
}

IMPORTANT: 
- Return ONLY valid JSON, no markdown, no code fences, no commentary
- The top-level object must contain exactly one key: "questions"
- Ensure valid JSON format (use double quotes, escape special characters)
- correctIdx must be 0, 1, 2, or 3 (zero-indexed)
- Keep each question, option, and explanation concise
`;
}

export function generateMCQPromptFromStudyNotes(
  studyNotes: string,
  lessonTitle: string,
): string {
  return `Generate exactly 20 professional multiple-choice assessment questions from these lesson study notes.

LESSON: ${lessonTitle}

STUDY NOTES:
${studyNotes}

QUALITY REQUIREMENTS:
- Questions must assess understanding, not memorization of random details
- Cover definitions, comparisons, workflow, cause/effect, examples, and applied scenarios from the notes
- Use polished LMS-style wording suitable for a paid course assessment
- Avoid tiny one-line questions like "What is X?" unless it is a core definition
- Every question should be specific enough that a learner must understand the lesson context
- Each question must have exactly 4 plausible options
- Distractors must be realistic, not silly or obviously wrong
- Only ONE option can be correct
- Include concise but useful explanations, 1 sentence each
- Difficulty distribution: 8 foundational, 7 intermediate, 5 applied/tough
- Correct index must be balanced across 0, 1, 2, and 3
- Do not ask about trainer identity, platform admin details, schedules, fees, or irrelevant company background
- Do not invent content outside the study notes

OUTPUT FORMAT:
{
  "questions": [
    {
      "question": "In the lesson context, why does ...?",
      "options": ["...", "...", "...", "..."],
      "correctIdx": 0,
      "explanation": "..."
    }
  ]
}

IMPORTANT:
- Return ONLY valid JSON
- The top-level object must contain exactly one key: "questions"
- Generate exactly 20 questions
- Keep wording professional and complete, but not verbose
`;
}

/**
 * Extract plain text from WebVTT content
 */
function extractTextFromVTT(vttContent: string): string {
  const lines = vttContent.split('\n');
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip WEBVTT header, timestamps, and empty lines
    if (
      trimmed === 'WEBVTT' ||
      trimmed === '' ||
      /^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/.test(trimmed)
    ) {
      continue;
    }

    textLines.push(trimmed);
  }

  return textLines.join(' ');
}

function compactText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 20);

  if (sentences.length === 0) {
    return text.slice(0, maxChars);
  }

  const selected: string[] = [];
  const targetCount = Math.min(80, sentences.length);
  const step = Math.max(1, Math.floor(sentences.length / targetCount));

  for (let index = 0; index < sentences.length; index += step) {
    selected.push(sentences[index]);
    const joined = selected.join(" ");
    if (joined.length >= maxChars) {
      return joined.slice(0, maxChars);
    }
  }

  return selected.join(" ").slice(0, maxChars);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Validate MCQ JSON structure
 */
export interface MCQQuestion {
  question: string;
  options: string[];
  correctIdx: number;
  explanation?: string;
}

function extractJSONPayload(jsonString: string): unknown {
  const trimmed = jsonString.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const arrayStart = withoutFence.indexOf("[");
    const arrayEnd = withoutFence.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(withoutFence.slice(arrayStart, arrayEnd + 1));
    }

    const objectStart = withoutFence.indexOf("{");
    const objectEnd = withoutFence.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1));
    }

    throw new Error("No JSON object or array found");
  }
}

export function validateMCQJSON(jsonString: string): {
  valid: boolean;
  questions?: MCQQuestion[];
  error?: string;
} {
  try {
    const payload = extractJSONPayload(jsonString);
    const parsed = Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          "questions" in payload &&
          Array.isArray((payload as { questions?: unknown }).questions)
        ? (payload as { questions: unknown[] }).questions
        : null;

    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'JSON must be an array or an object with a "questions" array' };
    }

    if (parsed.length !== 20) {
      return { valid: false, error: `Expected 20 questions, got ${parsed.length}` };
    }

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];

      if (!q.question || typeof q.question !== 'string') {
        return { valid: false, error: `Question ${i + 1}: missing or invalid question field` };
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return { valid: false, error: `Question ${i + 1}: must have exactly 4 options` };
      }

      if (typeof q.correctIdx !== 'number' || q.correctIdx < 0 || q.correctIdx > 3) {
        return { valid: false, error: `Question ${i + 1}: correctIdx must be 0, 1, 2, or 3` };
      }

      if (q.options.some((opt: unknown) => typeof opt !== 'string')) {
        return { valid: false, error: `Question ${i + 1}: all options must be strings` };
      }

      if (q.question.trim().length < 12) {
        return { valid: false, error: `Question ${i + 1}: question is too short` };
      }

      if (q.options.some((opt: string) => opt.trim().length < 1)) {
        return { valid: false, error: `Question ${i + 1}: options cannot be empty` };
      }
    }

    return { valid: true, questions: parsed as MCQQuestion[] };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`
    };
  }
}

export function parseMCQJSONLoose(jsonString: string): {
  valid: boolean;
  questions?: MCQQuestion[];
  error?: string;
} {
  try {
    const payload = extractJSONPayload(jsonString);
    const parsed = Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          "questions" in payload &&
          Array.isArray((payload as { questions?: unknown }).questions)
        ? (payload as { questions: unknown[] }).questions
        : null;

    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'JSON must be an array or an object with a "questions" array' };
    }

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];

      if (!q.question || typeof q.question !== 'string') {
        return { valid: false, error: `Question ${i + 1}: missing or invalid question field` };
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return { valid: false, error: `Question ${i + 1}: must have exactly 4 options` };
      }

      if (typeof q.correctIdx !== 'number' || q.correctIdx < 0 || q.correctIdx > 3) {
        return { valid: false, error: `Question ${i + 1}: correctIdx must be 0, 1, 2, or 3` };
      }

      if (q.options.some((opt: unknown) => typeof opt !== 'string')) {
        return { valid: false, error: `Question ${i + 1}: all options must be strings` };
      }
    }

    return { valid: true, questions: parsed as MCQQuestion[] };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`
    };
  }
}

/**
 * Format questions for display
 */
export function formatQuestionsForPreview(questions: MCQQuestion[]): string {
  return questions
    .map((q, idx) => {
      const options = q.options
        .map((opt, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx); // A, B, C, D
          const marker = optIdx === q.correctIdx ? '✓' : ' ';
          return `  ${letter}) ${opt} ${marker}`;
        })
        .join('\n');

      return `${idx + 1}. ${q.question}\n${options}`;
    })
    .join('\n\n');
}
