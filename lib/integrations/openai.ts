/**
 * OpenAI integration layer (stubbed for now).
 *
 * MVP requirements:
 * - Provide PHI validation for pasted transcripts BEFORE any model calls.
 * - Keep summarization/action-items helpers as stubs we can implement later.
 * - Follow-up email is Phase 2 and should not be used in MVP wiring.
 */

export type TranscriptValidationResult = {
  safe: boolean;
  warning?: string;
  detectedPatterns?: string[];
};

type PhiPattern = {
  name: string;
  regex: RegExp;
  category: "medical" | "government_id" | "financial";
};

const PHI_PATTERNS: PhiPattern[] = [
  // Government ID
  {
    name: "US_SSN",
    category: "government_id",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    name: "US_SSN_NODASH",
    category: "government_id",
    regex: /\b\d{9}\b/g,
  },
  {
    name: "US_PASSPORT_LIKE",
    category: "government_id",
    regex: /\b[A-PR-WYa-pr-wy][1-9]\d{7}\b/g,
  },

  // Financial
  {
    name: "CREDIT_CARD_LIKE",
    category: "financial",
    // 13-19 digits with optional spaces/dashes
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    name: "US_ROUTING_NUMBER",
    category: "financial",
    regex: /\b\d{9}\b/g,
  },
  {
    name: "IBAN_LIKE",
    category: "financial",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },

  // Medical identifiers (heuristic)
  {
    name: "MRN_LIKE",
    category: "medical",
    regex: /\bMRN[:\s]*\d{6,}\b/gi,
  },
  {
    name: "MEDICARE_ID_LIKE",
    category: "medical",
    regex: /\b\d[A-Z0-9]{10}\b/g,
  },
];

function detectPatterns(text: string) {
  const found = new Set<string>();
  for (const p of PHI_PATTERNS) {
    if (p.regex.test(text)) {
      found.add(`${p.category}:${p.name}`);
    }
    p.regex.lastIndex = 0;
  }
  return Array.from(found);
}

/**
 * Validates a raw pasted transcript for PHI/PII-like patterns.
 * If unsafe, callers must NOT proceed to any model calls.
 */
export function validateTranscriptForProcessing(
  transcriptText: string,
): TranscriptValidationResult {
  const trimmed = transcriptText.trim();
  if (!trimmed) {
    return {
      safe: false,
      warning: "Transcript is empty.",
      detectedPatterns: [],
    };
  }

  const detectedPatterns = detectPatterns(trimmed);
  if (detectedPatterns.length) {
    return {
      safe: false,
      warning:
        "Transcript appears to contain sensitive identifiers (PHI/PII-like patterns). Please remove them before processing.",
      detectedPatterns,
    };
  }

  return { safe: true };
}

/**
 * Phase 1 (stub): will use gpt-4o-mini with JSON response format later.
 */
export async function generateMeetingSummary(_input: {
  transcriptText: string;
  meetingTitle?: string;
  meetingDate?: string;
}): Promise<{
  title: string;
  summary: string;
  topics?: string[];
  key_decisions?: string[];
}> {
  void _input;
  return {
    title: "Stub Meeting",
    summary: "This is a stubbed meeting summary.",
    topics: ["Status", "Risks", "Next steps"],
    key_decisions: ["Proceed with the stub implementation"],
  };
}

/**
 * Phase 1 (stub): will use gpt-4o-mini with JSON response format later.
 */
export async function extractActionItems(_input: {
  transcriptText: string;
}): Promise<
  Array<{
    text: string;
    assignee?: string;
    due_date?: string;
  }>
> {
  void _input;
  return [{ text: "Follow up on next steps", assignee: "Owner" }];
}

/**
 * Phase 2 (stub): follow-up email drafting (NOT used in MVP wiring).
 */
export async function generateFollowupEmail(_input: {
  transcriptText: string;
}): Promise<{ subject: string; body: string }> {
  void _input;
  return { subject: "Follow-up", body: "Thanks for the meeting..." };
}


