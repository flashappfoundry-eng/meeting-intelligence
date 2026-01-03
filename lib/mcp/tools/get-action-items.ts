// lib/mcp/tools/get-action-items.ts
/**
 * Tool: getActionItems
 * 
 * Extracts action items from a meeting transcript. Can work with:
 * 1. A Zoom meeting ID (fetches transcript from cloud recording)
 * 2. A raw transcript provided directly
 * 
 * Returns structured array of action items with:
 * - title: Clear description of the task
 * - assignee: Person responsible (if mentioned)
 * - dueDate: Deadline (if mentioned)
 * - priority: high/medium/low based on urgency indicators
 * - context: Which discussion/topic the item came from
 */

import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";
import { getUserTokens, refreshTokenIfNeeded } from "@/lib/auth/tokens";
import { createZoomClient } from "@/lib/integrations/zoom";
import { 
  extractActionItems, 
  parseVTTTranscript,
  validateTranscriptForProcessing,
  type ActionItem,
} from "@/lib/integrations/openai";
import { 
  type GetActionItemsOutput,
} from "@/lib/dx/schemas";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// MCP Tool response type
interface MCPToolResponse {
  content: Array<{ type: string; text: string }>;
  _meta?: Record<string, unknown>;
}

export async function handleGetActionItems(
  user: AuthenticatedUser,
  args: Record<string, unknown>
): Promise<MCPToolResponse> {
  const meetingId = args.meetingId as string | undefined;
  const transcript = args.transcript as string | undefined;
  const meetingTitleArg = args.meetingTitle as string | undefined;
  
  console.log("[getActionItems] ====== START ======");
  console.log("[getActionItems] User:", user.id, user.email);
  console.log("[getActionItems] Meeting ID:", meetingId || "(none)");
  console.log("[getActionItems] Transcript provided:", !!transcript);
  console.log("[getActionItems] Meeting title:", meetingTitleArg || "(none)");
  
  // Need either a meeting ID or a transcript
  if (!meetingId && !transcript) {
    return {
      content: [
        {
          type: "text",
          text: "Please provide either a meeting ID or a transcript to extract action items from.\n\n" +
            "**Options:**\n" +
            "1. Use `getRecentMeetings` to find a meeting ID, then call this tool with the meetingId\n" +
            "2. Use `pasteTranscript` to provide a transcript directly",
        },
      ],
    };
  }
  
  let plainTranscript: string;
  let meetingTopic: string | undefined;
  let meetingDate: string | undefined;
  
  // If we have a meeting ID, fetch the transcript from Zoom
  if (meetingId) {
    const zoomResult = await fetchZoomTranscript(user, meetingId);
    
    if (!zoomResult.success) {
      return zoomResult.response!;
    }
    
    plainTranscript = zoomResult.transcript!;
    meetingTopic = zoomResult.meetingTopic;
    meetingDate = zoomResult.meetingDate;
  } else {
    // Use the provided transcript
    plainTranscript = transcript!;
    
    // Check if it's VTT format
    if (plainTranscript.startsWith("WEBVTT")) {
      plainTranscript = parseVTTTranscript(plainTranscript);
    }
  }
  
  console.log("[getActionItems] Transcript length:", plainTranscript.length);
  
  if (plainTranscript.length < 50) {
    return {
      content: [
        {
          type: "text",
          text: "The transcript is too short to extract meaningful action items. Please provide a more complete transcript.",
        },
      ],
    };
  }
  
  // Validate for PHI/PII
  const validation = validateTranscriptForProcessing(plainTranscript);
  if (!validation.safe) {
    console.log("[getActionItems] Transcript validation failed:", validation.warning);
    return {
      content: [
        {
          type: "text",
          text: `⚠️ Cannot process this transcript.\n\n${validation.warning}\n\nPlease remove sensitive information before processing.`,
        },
      ],
    };
  }
  
  // Extract action items with OpenAI
  console.log("[getActionItems] Extracting action items with AI...");
  
  try {
    const result = await extractActionItems({
      transcriptText: plainTranscript,
      meetingTitle: meetingTopic,
    });
    
    console.log("[getActionItems] Found", result.count, "action items");
    console.log("[getActionItems] ====== SUCCESS ======");
    
    // Construct output matching GetActionItemsOutput schema
    const outputData: GetActionItemsOutput = {
      meetingId: meetingId || undefined,
      meetingTitle: meetingTopic || meetingTitleArg || undefined,
      meetingDate: meetingDate || undefined,
      actionItems: result.actionItems,
      extractedAt: new Date().toISOString(),
    };
    
    if (result.count === 0) {
      const message = meetingTopic 
        ? `No action items found in meeting "${meetingTopic}".\n\nThis meeting may have been informational without explicit tasks or follow-ups assigned.`
        : "No action items found in this transcript.\n\nThe conversation may not have included explicit tasks, commitments, or follow-ups.";
      
      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
        _meta: {
          ...outputData,
          message,
        },
      };
    }
    
    // Format action items for display
    const formattedItems = formatActionItems(result.actionItems);
    
    return {
      content: [
        {
          type: "text",
          text: `# Action Items${meetingTopic ? ` - ${meetingTopic}` : ""}\n\n` +
            `${meetingDate ? `📅 Meeting Date: ${new Date(meetingDate).toLocaleDateString()}\n\n` : ""}` +
            `Found **${result.count}** action item${result.count !== 1 ? "s" : ""}:\n\n` +
            `${formattedItems}\n\n` +
            `---\n\n` +
            `💡 *Use createTasks to add these to Asana or another task manager.*`,
        },
      ],
      _meta: outputData,
    };
    
  } catch (error) {
    console.error("[getActionItems] Error extracting action items:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes("OPENAI") || message.includes("API key")) {
      return {
        content: [
          {
            type: "text",
            text: "The action item extraction service is currently unavailable. Please try again later.",
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error extracting action items: ${message}`,
        },
      ],
    };
  }
}

/**
 * Fetch transcript from Zoom cloud recording
 */
async function fetchZoomTranscript(
  user: AuthenticatedUser, 
  meetingId: string
): Promise<{
  success: boolean;
  transcript?: string;
  meetingTopic?: string;
  meetingDate?: string;
  response?: MCPToolResponse;
}> {
  // Get Zoom tokens
  let tokens = await getUserTokens(user.id, "zoom");
  
  if (!tokens) {
    return {
      success: false,
      response: {
        content: [
          {
            type: "text",
            text: `You haven't connected your Zoom account yet. Please connect it first.\n\nConnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
          },
        ],
        _meta: {
          widget: {
            type: "connection-status",
            url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
          },
        },
      },
    };
  }
  
  try {
    tokens = await refreshTokenIfNeeded(user.id, "zoom", tokens);
    const zoom = createZoomClient(tokens.accessToken);
    
    // Get meeting recordings
    console.log("[getActionItems] Fetching Zoom recordings for meeting:", meetingId);
    const recordings = await zoom.getMeetingRecordings(meetingId);
    
    if (!recordings.recording_files?.length) {
      return {
        success: false,
        response: {
          content: [
            {
              type: "text",
              text: `No recordings found for meeting ${meetingId}. Try:\n\n` +
                `1. Providing a transcript directly using the 'transcript' parameter\n` +
                `2. Using 'pasteTranscript' tool to manually input a transcript`,
            },
          ],
        },
      };
    }
    
    // Find transcript file
    const transcriptFile = recordings.recording_files.find(
      f => f.file_type === "TRANSCRIPT" || f.file_type === "VTT"
    );
    
    if (!transcriptFile) {
      return {
        success: false,
        response: {
          content: [
            {
              type: "text",
              text: `Meeting "${recordings.topic}" has a recording but no transcript available.\n\n` +
                `You can use the 'pasteTranscript' tool to provide a transcript manually for action item extraction.`,
            },
          ],
        },
      };
    }
    
    // Download transcript
    console.log("[getActionItems] Downloading transcript...");
    let transcript = await zoom.downloadRecordingFile(transcriptFile.download_url);
    
    // Parse VTT if needed
    if (transcriptFile.file_type === "VTT" || transcript.startsWith("WEBVTT")) {
      transcript = parseVTTTranscript(transcript);
    }
    
    return {
      success: true,
      transcript,
      meetingTopic: recordings.topic,
      meetingDate: recordings.start_time,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message.includes("404") || message.includes("not found")) {
      return {
        success: false,
        response: {
          content: [
            {
              type: "text",
              text: `Meeting ${meetingId} not found or has no recordings.\n\n` +
                `You can provide a transcript directly using the 'transcript' parameter.`,
            },
          ],
        },
      };
    }
    
    if (message.includes("401") || message.includes("unauthorized")) {
      return {
        success: false,
        response: {
          content: [
            {
              type: "text",
              text: `Your Zoom connection has expired. Please reconnect.\n\nReconnect: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
            },
          ],
          _meta: {
            widget: {
              type: "connection-status",
              url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
            },
          },
        },
      };
    }
    
    throw error;
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
    
    let line = `${index + 1}. ${priorityEmoji} **${item.title}**`;
    
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
