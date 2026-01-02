// lib/mcp/tools/get-recent-meetings.ts
import { type AuthenticatedUser } from "@/lib/auth/mcp-auth";
import { getUserTokens, refreshTokenIfNeeded } from "@/lib/auth/tokens";
import { createZoomClient } from "@/lib/integrations/zoom";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export async function handleGetRecentMeetings(
  user: AuthenticatedUser,
  args: Record<string, unknown>
) {
  const limit = typeof args.limit === "number" ? args.limit : 10;
  const includeAll = args.includeAll === true || args.include_past === true;
  
  console.log("[getRecentMeetings] ====== START ======");
  console.log("[getRecentMeetings] User ID:", user.id);
  console.log("[getRecentMeetings] User Email:", user.email);
  console.log("[getRecentMeetings] Args:", JSON.stringify(args));
  console.log("[getRecentMeetings] Limit:", limit, "Include all:", includeAll);
  
  // Get Zoom tokens for this user
  console.log("[getRecentMeetings] Looking up Zoom tokens for user:", user.id);
  let tokens = await getUserTokens(user.id, "zoom");
  
  console.log("[getRecentMeetings] Tokens lookup result:", {
    found: !!tokens,
    hasAccessToken: !!tokens?.accessToken,
    hasRefreshToken: !!tokens?.refreshToken,
    expiresAt: tokens?.expiresAt?.toISOString() ?? "N/A",
  });
  
  if (!tokens) {
    console.log("[getRecentMeetings] ❌ No Zoom tokens - user needs to connect");
    return {
      content: [
        {
          type: "text",
          text: `You haven't connected your Zoom account yet. Please connect it first to see your meetings.\n\nConnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
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
    console.log("[getRecentMeetings] Checking if token needs refresh...");
    tokens = await refreshTokenIfNeeded(user.id, "zoom", tokens);
    console.log("[getRecentMeetings] Token refresh check complete");
    
    console.log("[getRecentMeetings] Creating Zoom client...");
    const zoom = createZoomClient(tokens.accessToken);
    
    // Optionally verify the token works by getting user info
    // This may fail if user:read:user scope is not granted, which is OK
    console.log("[getRecentMeetings] Verifying Zoom token by fetching user info...");
    try {
      const zoomUser = await zoom.getMe();
      console.log("[getRecentMeetings] ✅ Zoom user verified:", zoomUser.email);
    } catch (verifyError) {
      const verifyMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
      // If it's just a scope issue, continue - meetings might still work
      if (verifyMsg.includes("scope") || verifyMsg.includes("4711")) {
        console.log("[getRecentMeetings] ⚠️ user:read:user scope not granted, continuing...");
      } else {
        console.error("[getRecentMeetings] ❌ Zoom token verification failed:", verifyError);
        throw verifyError;
      }
    }
    
    // Fetch meetings
    console.log("[getRecentMeetings] Fetching meetings (includeAll:", includeAll, ")...");
    const meetings = includeAll 
      ? await zoom.listAllMeetings(limit)
      : await zoom.listRecentMeetings(limit, "scheduled");
    
    console.log("[getRecentMeetings] ✅ Got", meetings.length, "meetings");
    
    if (meetings.length === 0) {
      console.log("[getRecentMeetings] No meetings found");
      return {
        content: [
          {
            type: "text",
            text: includeAll 
              ? "No meetings found (scheduled or past). You might want to check your Zoom account or schedule a new meeting."
              : "No scheduled meetings found. Try asking for 'all meetings including past' to see completed meetings, or schedule a new meeting in Zoom.",
          },
        ],
      };
    }
    
    // Format meetings for display
    const meetingList = meetings.map((m, i) => {
      const startTime = m.start_time 
        ? new Date(m.start_time).toLocaleString()
        : "No start time";
      const isPast = m.start_time && new Date(m.start_time) < new Date();
      const status = isPast ? "📅 Past" : "🔜 Upcoming";
      return `${i + 1}. **${m.topic || "Untitled Meeting"}** ${status}\n   - ID: ${m.id}\n   - Start: ${startTime}`;
    }).join("\n\n");
    
    console.log("[getRecentMeetings] ====== SUCCESS ======");
    
    return {
      content: [
        {
          type: "text",
          text: `Found ${meetings.length} meeting(s):\n\n${meetingList}`,
        },
      ],
      _meta: {
        meetings: meetings.map(m => ({
          id: String(m.id),
          topic: m.topic || "Untitled",
          start_time: m.start_time,
        })),
      },
    };
  } catch (error) {
    console.error("[getRecentMeetings] ❌ Error:", error);
    console.error("[getRecentMeetings] Error stack:", error instanceof Error ? error.stack : "N/A");
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Check if it's a scope error (missing permissions)
    if (message.includes("scope") || message.includes("4711")) {
      console.log("[getRecentMeetings] Detected scope error - missing Zoom permissions");
      return {
        content: [
          {
            type: "text",
            text: `Your Zoom connection is missing required permissions. This can happen if the Zoom app was updated with new scopes.\n\n**Please disconnect and reconnect your Zoom account** to grant the updated permissions.\n\nReconnect here: ${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=zoom`,
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
    
    // Check if it's an auth error
    if (message.includes("401") || message.includes("unauthorized") || message.includes("invalid_token") || message.includes("Invalid access token")) {
      console.log("[getRecentMeetings] Detected auth error - token likely expired");
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
    
    return {
      content: [
        {
          type: "text",
          text: `Error fetching meetings: ${message}`,
        },
      ],
    };
  }
}

