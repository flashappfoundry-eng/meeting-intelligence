/**
 * OpenAI integration layer for meeting intelligence features.
 *
 * Features:
 * - PHI/PII validation for transcripts
 * - Meeting summarization with gpt-4o-mini
 * - Action item extraction
 * - Follow-up email generation (Phase 2)
 */

import OpenAI from "openai";

// Lazy initialization to avoid errors when API key isn't set
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ============================================
// PHI/PII Detection
// ============================================

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

// ============================================
// VTT/Transcript Parsing
// ============================================

/**
 * Parse VTT (WebVTT) format transcript into plain text
 */
export function parseVTTTranscript(vttContent: string): string {
  const lines = vttContent.split("\n");
  const textLines: string[] = [];
  let currentSpeaker = "";
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip WEBVTT header and metadata
    if (trimmed === "WEBVTT" || trimmed.startsWith("NOTE") || trimmed === "") {
      continue;
    }
    
    // Skip timestamp lines (00:00:00.000 --> 00:00:05.000)
    if (trimmed.includes("-->")) {
      continue;
    }
    
    // Skip cue identifiers (numeric lines)
    if (/^\d+$/.test(trimmed)) {
      continue;
    }
    
    // Check for speaker label pattern: "Speaker Name: text"
    const speakerMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (speakerMatch) {
      const [, speaker, text] = speakerMatch;
      if (speaker !== currentSpeaker) {
        currentSpeaker = speaker;
        textLines.push(`\n${speaker}: ${text}`);
      } else {
        textLines.push(text);
      }
    } else {
      textLines.push(trimmed);
    }
  }
  
  return textLines.join(" ").replace(/\s+/g, " ").trim();
}

// ============================================
// Meeting Summarization
// ============================================

export type MeetingSummaryResult = {
  title: string;
  summary: string;
  topics?: string[];
  keyDecisions?: string[];
  participants?: string[];
};

/**
 * Generate an AI summary of a meeting transcript
 */
export async function generateMeetingSummary(input: {
  transcriptText: string;
  meetingTitle?: string;
  meetingDate?: string;
}): Promise<MeetingSummaryResult> {
  console.log("[OpenAI] generateMeetingSummary called");
  console.log("[OpenAI] Transcript length:", input.transcriptText.length);
  
  const openai = getOpenAIClient();
  
  // Truncate very long transcripts to fit in context window
  const maxTranscriptLength = 100000; // ~25k tokens
  const transcript = input.transcriptText.length > maxTranscriptLength
    ? input.transcriptText.slice(0, maxTranscriptLength) + "\n\n[Transcript truncated due to length...]"
    : input.transcriptText;

  const systemPrompt = `You are a professional meeting summarization assistant. Analyze the meeting transcript and provide a comprehensive summary.

Return a JSON object with the following structure:
{
  "title": "A concise, descriptive title for the meeting (max 100 chars)",
  "summary": "A 2-3 paragraph summary of what was discussed, key points, and outcomes",
  "topics": ["Topic 1", "Topic 2", ...],  // Main subjects covered (3-7 items)
  "keyDecisions": ["Decision 1", "Decision 2", ...],  // Any decisions or agreements made
  "participants": ["Name 1", "Name 2", ...]  // Participant names mentioned (if identifiable)
}

Be concise but comprehensive. Focus on actionable insights and key takeaways.`;

  const userPrompt = `Please summarize this meeting transcript:

${input.meetingTitle ? `Meeting Title: ${input.meetingTitle}` : ""}
${input.meetingDate ? `Date: ${input.meetingDate}` : ""}

---
${transcript}
---`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    console.log("[OpenAI] Summary generated successfully");
    
    const parsed = JSON.parse(content);
    return {
      title: parsed.title || input.meetingTitle || "Meeting Summary",
      summary: parsed.summary || "Unable to generate summary.",
      topics: parsed.topics || [],
      keyDecisions: parsed.keyDecisions || parsed.key_decisions || [],
      participants: parsed.participants || [],
    };
  } catch (error) {
    console.error("[OpenAI] Error generating summary:", error);
    throw error;
  }
}

// ============================================
// Action Item Extraction
// ============================================

export type ActionItem = {
  task: string;
  assignee?: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  context?: string;
};

export type ActionItemsResult = {
  actionItems: ActionItem[];
  count: number;
};

/**
 * Extract action items from a meeting transcript
 */
export async function extractActionItems(input: {
  transcriptText: string;
  meetingTitle?: string;
}): Promise<ActionItemsResult> {
  console.log("[OpenAI] extractActionItems called");
  console.log("[OpenAI] Transcript length:", input.transcriptText.length);
  
  const openai = getOpenAIClient();
  
  // Truncate very long transcripts
  const maxTranscriptLength = 100000;
  const transcript = input.transcriptText.length > maxTranscriptLength
    ? input.transcriptText.slice(0, maxTranscriptLength) + "\n\n[Transcript truncated...]"
    : input.transcriptText;

  const systemPrompt = `You are an action item extraction assistant. Analyze the meeting transcript and extract all action items, tasks, and commitments made.

Return a JSON object with the following structure:
{
  "actionItems": [
    {
      "task": "Clear description of what needs to be done",
      "assignee": "Person responsible (if mentioned, otherwise null)",
      "dueDate": "Due date in YYYY-MM-DD format (if mentioned, otherwise null)",
      "priority": "high" | "medium" | "low",
      "context": "Brief context from the meeting (1-2 sentences)"
    }
  ]
}

Guidelines:
- Include explicit action items ("John will send the report")
- Include implied commitments ("We need to follow up on...")
- Include mentioned deadlines ("by end of week", "before Tuesday")
- Set priority based on urgency/importance discussed
- If no action items are found, return {"actionItems": []}`;

  const userPrompt = `Extract action items from this meeting transcript:

${input.meetingTitle ? `Meeting: ${input.meetingTitle}` : ""}

---
${transcript}
---`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    console.log("[OpenAI] Action items extracted successfully");
    
    const parsed = JSON.parse(content);
    const actionItems: ActionItem[] = (parsed.actionItems || parsed.items || []).map((item: Record<string, unknown>) => ({
      task: String(item.task || item.title || ""),
      assignee: item.assignee ? String(item.assignee) : undefined,
      dueDate: item.dueDate || item.due_date ? String(item.dueDate || item.due_date) : undefined,
      priority: (item.priority as ActionItem["priority"]) || "medium",
      context: item.context ? String(item.context) : undefined,
    })).filter((item: ActionItem) => item.task.length > 0);

    return {
      actionItems,
      count: actionItems.length,
    };
  } catch (error) {
    console.error("[OpenAI] Error extracting action items:", error);
    throw error;
  }
}

// ============================================
// Follow-up Email (Phase 2)
// ============================================

/**
 * Generate a follow-up email based on meeting content
 */
export async function generateFollowupEmail(input: {
  transcriptText: string;
  meetingTitle?: string;
  recipients?: string[];
  tone?: "formal" | "casual" | "professional";
}): Promise<{ subject: string; body: string }> {
  console.log("[OpenAI] generateFollowupEmail called");
  
  const openai = getOpenAIClient();
  
  const tone = input.tone || "professional";
  const transcript = input.transcriptText.slice(0, 50000); // Shorter for email context

  const systemPrompt = `You are a professional email writer. Generate a follow-up email based on the meeting transcript.

Return a JSON object with:
{
  "subject": "Email subject line",
  "body": "Email body text (use \\n for line breaks)"
}

Guidelines:
- Tone: ${tone}
- Include a brief meeting recap
- Highlight key decisions made
- List action items with owners if assigned
- Include next steps
- Keep it concise but comprehensive`;

  const userPrompt = `Generate a follow-up email for this meeting:

${input.meetingTitle ? `Meeting: ${input.meetingTitle}` : ""}
${input.recipients?.length ? `Recipients: ${input.recipients.join(", ")}` : ""}

---
${transcript}
---`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || "Meeting Follow-up",
      body: parsed.body || "Thank you for attending the meeting.",
    };
  } catch (error) {
    console.error("[OpenAI] Error generating follow-up email:", error);
    throw error;
  }
}
