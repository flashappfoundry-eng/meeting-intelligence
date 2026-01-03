// lib/mcp/tools/paste-transcript.ts
/**
 * Tool: pasteTranscript
 * 
 * Process a pasted meeting transcript for summary and action items.
 * This is useful when:
 * - Cloud recording isn't available
 * - User has a transcript from another source (manual notes, other tools)
 * - User wants to process text without connecting to Zoom
 */

import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";
import { 
  generateMeetingSummary, 
  extractActionItems,
  parseVTTTranscript,
  validateTranscriptForProcessing,
  type ActionItem,
} from "@/lib/integrations/openai";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export async function handlePasteTranscript(
  user: AuthenticatedUser,
  args: Record<string, unknown>
) {
  const transcript = args.transcript as string | undefined;
  const meetingTitle = args.meetingTitle as string | undefined;
  const operation = (args.operation as string) || "both"; // "summary", "action_items", or "both"
  
  console.log("[pasteTranscript] ====== START ======");
  console.log("[pasteTranscript] User:", user.id, user.email);
  console.log("[pasteTranscript] Meeting title:", meetingTitle || "(none)");
  console.log("[pasteTranscript] Operation:", operation);
  console.log("[pasteTranscript] Transcript length:", transcript?.length || 0);
  
  if (!transcript || transcript.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Please provide a transcript to analyze.\n\n" +
            "**Usage:**\n" +
            "- Paste your meeting transcript directly\n" +
            "- You can optionally provide a `meetingTitle`\n" +
            "- Use `operation: 'summary'` for just a summary\n" +
            "- Use `operation: 'action_items'` for just action items\n" +
            "- Default is both",
        },
      ],
    };
  }
  
  // Parse VTT format if detected
  let plainTranscript = transcript;
  if (transcript.trim().startsWith("WEBVTT")) {
    console.log("[pasteTranscript] Detected VTT format, parsing...");
    plainTranscript = parseVTTTranscript(transcript);
  }
  
  // Check minimum length
  if (plainTranscript.length < 100) {
    return {
      content: [
        {
          type: "text",
          text: `The transcript is too short (${plainTranscript.length} characters).\n\n` +
            "Please provide a more complete transcript for meaningful analysis.",
        },
      ],
    };
  }
  
  // Validate for PHI/PII
  console.log("[pasteTranscript] Validating transcript for sensitive data...");
  const validation = validateTranscriptForProcessing(plainTranscript);
  
  if (!validation.safe) {
    console.log("[pasteTranscript] Validation failed:", validation.warning);
    return {
      content: [
        {
          type: "text",
          text: `⚠️ **Cannot process this transcript**\n\n` +
            `${validation.warning}\n\n` +
            `**Detected patterns:** ${validation.detectedPatterns?.join(", ") || "unknown"}\n\n` +
            `Please remove or redact sensitive information (SSNs, credit cards, medical record numbers, etc.) before processing.`,
        },
      ],
    };
  }
  
  console.log("[pasteTranscript] Validation passed, processing transcript...");
  
  try {
    const results: {
      summary?: Awaited<ReturnType<typeof generateMeetingSummary>>;
      actionItems?: Awaited<ReturnType<typeof extractActionItems>>;
    } = {};
    
    // Process based on requested operation
    if (operation === "summary" || operation === "both") {
      console.log("[pasteTranscript] Generating summary...");
      results.summary = await generateMeetingSummary({
        transcriptText: plainTranscript,
        meetingTitle,
      });
    }
    
    if (operation === "action_items" || operation === "both") {
      console.log("[pasteTranscript] Extracting action items...");
      results.actionItems = await extractActionItems({
        transcriptText: plainTranscript,
        meetingTitle,
      });
    }
    
    console.log("[pasteTranscript] ====== SUCCESS ======");
    
    // Build response text
    let responseText = "";
    
    if (results.summary) {
      const topicsFormatted = results.summary.topics?.length 
        ? results.summary.topics.map(t => `• ${t}`).join("\n")
        : "No specific topics identified";
      
      const decisionsFormatted = results.summary.keyDecisions?.length
        ? results.summary.keyDecisions.map(d => `• ${d}`).join("\n")
        : "No key decisions recorded";
      
      responseText += `# ${results.summary.title}\n\n`;
      responseText += `## Summary\n\n${results.summary.summary}\n\n`;
      responseText += `## Topics Discussed\n\n${topicsFormatted}\n\n`;
      responseText += `## Key Decisions\n\n${decisionsFormatted}\n\n`;
    }
    
    if (results.actionItems) {
      if (results.summary) {
        responseText += `---\n\n`;
      }
      
      if (results.actionItems.count === 0) {
        responseText += `## Action Items\n\nNo action items were identified in this transcript.\n`;
      } else {
        responseText += `## Action Items (${results.actionItems.count})\n\n`;
        responseText += formatActionItems(results.actionItems.actionItems);
        responseText += `\n\n💡 *Use createTasks to add these to Asana or another task manager.*`;
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
      _meta: {
        meetingTitle: results.summary?.title || meetingTitle,
        transcriptLength: plainTranscript.length,
        operation,
        summary: results.summary ? {
          title: results.summary.title,
          topics: results.summary.topics,
          keyDecisions: results.summary.keyDecisions,
          participants: results.summary.participants,
        } : undefined,
        actionItems: results.actionItems?.actionItems,
        actionItemCount: results.actionItems?.count,
        widget: {
          type: "meeting-summary",
          url: `${BASE_URL}/widgets/meeting-summary?userId=${user.id}`,
        },
      },
    };
    
  } catch (error) {
    console.error("[pasteTranscript] Error processing transcript:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes("OPENAI") || message.includes("API key")) {
      return {
        content: [
          {
            type: "text",
            text: "The transcript processing service is currently unavailable. Please try again later.\n\n" +
              "This typically means the AI service is temporarily down or misconfigured.",
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error processing transcript: ${message}\n\n` +
            "Please try again. If the issue persists, the transcript may be too long or contain unsupported content.",
        },
      ],
    };
  }
}

/**
 * Format action items for display
 */
function formatActionItems(items: ActionItem[]): string {
  return items.map((item, index) => {
    const priorityEmoji = {
      high: "🔴",
      medium: "🟡", 
      low: "🟢",
    }[item.priority];
    
    let line = `${index + 1}. ${priorityEmoji} **${item.task}**`;
    
    const details: string[] = [];
    if (item.assignee) {
      details.push(`👤 ${item.assignee}`);
    }
    if (item.dueDate) {
      details.push(`📅 ${item.dueDate}`);
    }
    
    if (details.length > 0) {
      line += `\n   ${details.join(" | ")}`;
    }
    
    if (item.context) {
      line += `\n   _${item.context}_`;
    }
    
    return line;
  }).join("\n\n");
}
