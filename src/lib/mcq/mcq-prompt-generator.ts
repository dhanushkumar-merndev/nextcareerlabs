/**
 * Generate AI prompt from transcription to create MCQs
 */
export function generateMCQPrompt(vttContent: string, lessonTitle: string): string {
  // Extract plain text from VTT (remove timestamps)
  const plainText = extractTextFromVTT(vttContent);

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
- Include brief explanations for correct answers
- Cover key concepts, definitions, and important details from the transcription
- Difficulty distribution: 10 simple, 5 medium, 5 tough
- STRICT INDEX RANDOMIZATION: The \`correctIdx\` must be varied. AVOID repeating the same correct index for consecutive questions (e.g., if Q1 is 0, Q2 should be 1, 2, or 3).
- Ensure an even distribution of correct indices (0, 1, 2, 3) across the 20 questions (e.g., roughly 5 questions for each index position).
- Questions should be in logical order following the lesson flow
- Focus strictly on the educational topic and core concepts being taught
- AVOID questions about the company, trainer's background, or administrative details
- Avoid overly trivial questions

OUTPUT FORMAT (Valid JSON array):
[
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

IMPORTANT: 
- Return ONLY the JSON array, no additional text
- Ensure valid JSON format (use double quotes, escape special characters)
- correctIdx must be 0, 1, 2, or 3 (zero-indexed)
- Each question must be comprehensive but concise
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

export function validateMCQJSON(jsonString: string): {
  valid: boolean;
  questions?: MCQQuestion[];
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
      return { valid: false, error: 'JSON must be an array' };
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
    }

    return { valid: true, questions: parsed };
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
