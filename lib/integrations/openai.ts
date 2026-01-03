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
  id: string;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
  context: string | null;
  completed: boolean;
};

export type ActionItemsResult = {
  actionItems: ActionItem[];
  count: number;
};

/**
 * Test transcript for validating action item extraction.
 * Expected output: 4-5 action items with correct assignees and priorities.
 */
export const TEST_TRANSCRIPT = `
[00:00:15] Sarah: Let's review the Q4 roadmap. John, can you finalize the budget report by Friday?
[00:01:30] John: Sure, I'll have it done. Also, Maria needs to schedule the client demo for next week.
[00:02:45] Maria: Got it. I'll send out invites by tomorrow. Should we also discuss the urgent security patch?
[00:03:20] Sarah: Yes, that's critical. Dev team needs to deploy the fix by end of day today.
[00:04:00] John: I'll coordinate with DevOps on that ASAP.
`;

/**
 * Extract action items from a meeting transcript using GPT-4o-mini.
 * 
 * Identifies:
 * - Tasks explicitly assigned ("John will...", "Sarah to handle...")
 * - Deadlines mentioned ("by Friday", "next week", "end of month")
 * - Priority indicators ("urgent", "ASAP", "when possible")
 * - Context (which topic/discussion the item came from)
 */
export async function extractActionItems(input: {
  transcriptText: string;
  meetingTitle?: string;
}): Promise<ActionItemsResult> {
  console.log("[OpenAI] extractActionItems called");
  console.log("[OpenAI] Transcript length:", input.transcriptText.length);
  
  // Handle empty transcript
  if (!input.transcriptText || input.transcriptText.trim().length === 0) {
    console.log("[OpenAI] Empty transcript provided, returning empty result");
    return {
      actionItems: [],
      count: 0,
    };
  }
  
  const openai = getOpenAIClient();
  
  // Truncate very long transcripts
  const maxTranscriptLength = 100000;
  const transcript = input.transcriptText.length > maxTranscriptLength
    ? input.transcriptText.slice(0, maxTranscriptLength) + "\n\n[Transcript truncated...]"
    : input.transcriptText;

  const systemPrompt = `You are an expert action item extraction assistant. Your job is to carefully analyze meeting transcripts and identify ALL action items, tasks, and commitments.

## Task Assignment Patterns to Identify:
- Direct assignments: "John will...", "Sarah to handle...", "Can you [name] do..."
- Self-commitments: "I'll take care of...", "I will send...", "Let me handle..."
- Team assignments: "Dev team needs to...", "Marketing should...", "We need to..."
- Requests: "[Name], can you...", "[Name] needs to...", "Please [name]..."

## Deadline Patterns to Identify:
- Specific dates: "by Friday", "on Monday", "before the 15th"
- Relative dates: "next week", "tomorrow", "end of day", "end of month", "by EOD"
- Time-sensitive: "today", "this afternoon", "within the hour"
- Convert relative dates to context-appropriate descriptions (e.g., "Friday" not "2024-01-15")

## Priority Indicators:
- HIGH priority: "urgent", "ASAP", "critical", "immediately", "top priority", "must be done today", "blocking"
- MEDIUM priority: Default for standard tasks without urgency markers
- LOW priority: "when possible", "when you have time", "nice to have", "eventually", "low priority"

## Output Format:
Return a JSON object with:
{
  "actionItems": [
    {
      "title": "Clear, actionable task description (imperative form)",
      "assignee": "Person responsible (first name or role, null if unclear)",
      "dueDate": "Due date as mentioned (e.g., 'Friday', 'next week', 'end of day today', or null)",
      "priority": "high" | "medium" | "low",
      "context": "Brief context: what discussion/topic this came from (1 sentence)"
    }
  ]
}

## Guidelines:
1. Extract EVERY task, commitment, or follow-up mentioned
2. Use the exact assignee name as spoken (e.g., "John" not "John Smith")
3. For team assignments, use the team name (e.g., "Dev team", "DevOps")
4. Preserve deadline language as spoken when possible
5. Always include context to help understand the task origin
6. If no action items are found, return {"actionItems": []}
7. Write titles in clear, actionable imperative form (e.g., "Finalize budget report")`;

  const userPrompt = `Extract ALL action items from this meeting transcript. Be thorough - don't miss any tasks, commitments, or follow-ups.

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
      console.error("[OpenAI] No response content from API");
      throw new Error("No response from OpenAI API");
    }

    console.log("[OpenAI] Action items extracted successfully");
    console.log("[OpenAI] Raw response:", content.substring(0, 500));
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("[OpenAI] Failed to parse JSON response:", parseError);
      console.warn("[OpenAI] Falling back to empty array due to invalid JSON");
      return {
        actionItems: [],
        count: 0,
      };
    }
    
    const rawItems = parsed.actionItems || parsed.items || parsed.action_items || [];
    
    const actionItems: ActionItem[] = rawItems.map((item: Record<string, unknown>, index: number) => ({
      id: `action-${Date.now()}-${index}`,
      title: String(item.title || item.task || ""),
      assignee: item.assignee ? String(item.assignee) : null,
      dueDate: item.dueDate || item.due_date || item.deadline 
        ? String(item.dueDate || item.due_date || item.deadline) 
        : null,
      priority: validatePriority(item.priority),
      context: item.context ? String(item.context) : null,
      completed: false,
    })).filter((item: ActionItem) => item.title.length > 0);

    console.log("[OpenAI] Parsed", actionItems.length, "action items");

    return {
      actionItems,
      count: actionItems.length,
    };
  } catch (error) {
    console.error("[OpenAI] Error extracting action items:", error);
    
    // Provide descriptive error messages
    if (error instanceof Error) {
      if (error.message.includes("API key") || error.message.includes("OPENAI_API_KEY")) {
        throw new Error("OpenAI API key is not configured. Please contact support.");
      }
      if (error.message.includes("rate limit") || error.message.includes("429")) {
        throw new Error("OpenAI rate limit exceeded. Please try again in a moment.");
      }
      if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
        throw new Error("OpenAI request timed out. Please try again.");
      }
    }
    
    throw error;
  }
}

/**
 * Validate and normalize priority value
 */
function validatePriority(value: unknown): "high" | "medium" | "low" {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (normalized === "high" || normalized === "urgent" || normalized === "critical") {
      return "high";
    }
    if (normalized === "low") {
      return "low";
    }
  }
  return "medium";
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
