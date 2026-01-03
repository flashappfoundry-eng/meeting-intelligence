// lib/mcp/tools/get-meeting-summary.ts
/**
 * Tool: getMeetingSummary
 * 
 * Fetches a meeting's cloud recording transcript from Zoom and generates
 * an AI summary with key points, decisions, and topics discussed.
 */

import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";
import { getUserTokens, refreshTokenIfNeeded } from "@/lib/auth/tokens";
import { createZoomClient } from "@/lib/integrations/zoom";
import { 
  generateMeetingSummary, 
  parseVTTTranscript,
  validateTranscriptForProcessing,
} from "@/lib/integrations/openai";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export async function handleGetMeetingSummary(
  user: AuthenticatedUser,
  args: Record<string, unknown>
) {
  const meetingId = args.meetingId as string;
  
  console.log("[getMeetingSummary] ====== START ======");
  console.log("[getMeetingSummary] User:", user.id, user.email);
  console.log("[getMeetingSummary] Meeting ID:", meetingId);
  
  if (!meetingId) {
    return {
      content: [
        {
          type: "text",
          text: "Please provide a meeting ID. You can get meeting IDs by using the 'getRecentMeetings' tool first.",
        },
      ],
    };
  }
  
  // Get Zoom tokens
  let tokens = await getUserTokens(user.id, "zoom");
  
  if (!tokens) {
    console.log("[getMeetingSummary] No Zoom tokens - user needs to connect");
    return {
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
    };
  }
  
  try {
    // Refresh token if needed
    tokens = await refreshTokenIfNeeded(user.id, "zoom", tokens);
    
    const zoom = createZoomClient(tokens.accessToken);
    
    // 1. Get meeting recordings
    console.log("[getMeetingSummary] Fetching recordings for meeting:", meetingId);
    let recordings;
    try {
      recordings = await zoom.getMeetingRecordings(meetingId);
    } catch (recordingError) {
      const errMsg = recordingError instanceof Error ? recordingError.message : String(recordingError);
      
      // Handle specific errors
      if (errMsg.includes("404") || errMsg.includes("not found")) {
        return {
          content: [
            {
              type: "text",
              text: `No recordings found for meeting ${meetingId}.\n\nThis could mean:\n- The meeting hasn't occurred yet\n- Cloud recording wasn't enabled for this meeting\n- The recording is still processing\n- The meeting ID is incorrect\n\nTip: Use 'getRecentMeetings' to find meetings with available recordings.`,
            },
          ],
        };
      }
      
      if (errMsg.includes("scope") || errMsg.includes("4711")) {
        return {
          content: [
            {
              type: "text",
              text: `Your Zoom connection is missing recording permissions. Please reconnect your Zoom account with the updated permissions.\n\nReconnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
            },
          ],
          _meta: {
            widget: {
              type: "connection-status", 
              url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
            },
          },
        };
      }
      
      throw recordingError;
    }
    
    console.log("[getMeetingSummary] Found recording with", recordings.recording_files?.length || 0, "files");
    
    if (!recordings.recording_files?.length) {
      return {
        content: [
          {
            type: "text",
            text: `Meeting "${recordings.topic || meetingId}" has a recording but no files are available yet.\n\nThe recording may still be processing. Please try again in a few minutes.`,
          },
        ],
      };
    }
    
    // 2. Find transcript file
    const transcriptFile = recordings.recording_files.find(
      f => f.file_type === "TRANSCRIPT" || f.file_type === "VTT"
    );
    
    if (!transcriptFile) {
      // Check what files ARE available
      const availableTypes = recordings.recording_files.map(f => f.file_type);
      console.log("[getMeetingSummary] Available file types:", availableTypes);
      
      const hasVideo = availableTypes.includes("MP4");
      const hasAudio = availableTypes.includes("M4A");
      
      return {
        content: [
          {
            type: "text",
            text: `Meeting "${recordings.topic}" has ${hasVideo ? "video" : hasAudio ? "audio" : "a"} recording but no transcript.\n\n**To get transcripts for future meetings:**\n1. Go to Zoom Settings → Recording\n2. Enable "Audio transcript"\n3. Enable "Save panelist chat to the recording"\n\n**For this meeting:**\nYou can use the **pasteTranscript** tool to manually provide a transcript for analysis.`,
          },
        ],
        _meta: {
          meetingId,
          meetingTopic: recordings.topic,
          hasRecording: true,
          availableFileTypes: availableTypes,
          suggestion: "Use pasteTranscript tool with manual transcript",
        },
      };
    }
    
    // 3. Download transcript
    console.log("[getMeetingSummary] Downloading transcript file:", transcriptFile.file_type);
    let transcriptContent: string;
    try {
      transcriptContent = await zoom.downloadRecordingFile(transcriptFile.download_url);
    } catch (downloadError) {
      console.error("[getMeetingSummary] Failed to download transcript:", downloadError);
      return {
        content: [
          {
            type: "text",
            text: `Found a transcript for meeting "${recordings.topic}" but failed to download it. Please try again in a moment.`,
          },
        ],
      };
    }
    
    console.log("[getMeetingSummary] Downloaded transcript:", transcriptContent.length, "characters");
    
    // 4. Parse VTT if needed
    let plainTranscript = transcriptContent;
    if (transcriptFile.file_type === "VTT" || transcriptContent.startsWith("WEBVTT")) {
      console.log("[getMeetingSummary] Parsing VTT transcript...");
      plainTranscript = parseVTTTranscript(transcriptContent);
    }
    
    console.log("[getMeetingSummary] Plain transcript:", plainTranscript.length, "characters");
    
    if (plainTranscript.length < 50) {
      return {
        content: [
          {
            type: "text",
            text: `The transcript for meeting "${recordings.topic}" is too short to summarize (${plainTranscript.length} characters). The recording may have been mostly silent or the transcript is incomplete.`,
          },
        ],
      };
    }
    
    // 5. Validate for PHI/PII
    const validation = validateTranscriptForProcessing(plainTranscript);
    if (!validation.safe) {
      console.log("[getMeetingSummary] Transcript validation failed:", validation.warning);
      return {
        content: [
          {
            type: "text",
            text: `⚠️ Cannot summarize this meeting transcript.\n\n${validation.warning}\n\nDetected patterns: ${validation.detectedPatterns?.join(", ")}\n\nPlease ensure sensitive information is removed before processing.`,
          },
        ],
      };
    }
    
    // 6. Generate summary with OpenAI
    console.log("[getMeetingSummary] Generating AI summary...");
    const summary = await generateMeetingSummary({
      transcriptText: plainTranscript,
      meetingTitle: recordings.topic,
      meetingDate: recordings.start_time,
    });
    
    console.log("[getMeetingSummary] ====== SUCCESS ======");
    
    // Format output
    const topicsFormatted = summary.topics?.length 
      ? summary.topics.map(t => `• ${t}`).join("\n")
      : "No specific topics identified";
    
    const decisionsFormatted = summary.keyDecisions?.length
      ? summary.keyDecisions.map(d => `• ${d}`).join("\n")
      : "No key decisions recorded";
    
    const participantsFormatted = summary.participants?.length
      ? summary.participants.join(", ")
      : "Not identified";
    
    return {
      content: [
        {
          type: "text",
          text: `# ${summary.title}\n\n` +
            `**Meeting:** ${recordings.topic}\n` +
            `**Date:** ${recordings.start_time ? new Date(recordings.start_time).toLocaleString() : "Unknown"}\n` +
            `**Duration:** ${recordings.duration || "Unknown"} minutes\n` +
            `**Participants:** ${participantsFormatted}\n\n` +
            `---\n\n` +
            `## Summary\n\n${summary.summary}\n\n` +
            `## Topics Discussed\n\n${topicsFormatted}\n\n` +
            `## Key Decisions\n\n${decisionsFormatted}\n\n` +
            `---\n\n` +
            `💡 *Use getActionItems to extract tasks from this meeting.*`,
        },
      ],
      _meta: {
        meetingId,
        meetingTopic: recordings.topic,
        meetingDate: recordings.start_time,
        duration: recordings.duration,
        transcriptLength: plainTranscript.length,
        summary: {
          title: summary.title,
          topics: summary.topics,
          keyDecisions: summary.keyDecisions,
          participants: summary.participants,
        },
      },
    };
    
  } catch (error) {
    console.error("[getMeetingSummary] Error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Handle auth errors
    if (message.includes("401") || message.includes("unauthorized") || message.includes("Invalid access token")) {
      return {
        content: [
          {
            type: "text",
            text: `Your Zoom connection has expired. Please reconnect your account.\n\nReconnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
          },
        ],
        _meta: {
          widget: {
            type: "connection-status",
            url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
          },
        },
      };
    }
    
    // Handle OpenAI errors
    if (message.includes("OPENAI") || message.includes("API key")) {
      return {
        content: [
          {
            type: "text",
            text: "The summarization service is currently unavailable. Please try again later.",
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `Error getting meeting summary: ${message}`,
        },
      ],
    };
  }
}
