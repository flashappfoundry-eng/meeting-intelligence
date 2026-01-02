// lib/mcp/tools/get-connection-status.ts
/**
 * Tool: getConnectionStatus
 * Returns the user's platform connection status
 */

import { getUserPlatformConnections, type AuthenticatedUser } from "@/lib/auth/mcp-auth";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

interface ConnectionStatusResult {
  content: Array<{ type: string; text: string }>;
  _meta?: {
    widget?: {
      type: string;
      url: string;
    };
  };
}

export async function handleGetConnectionStatus(
  user: AuthenticatedUser,
  _args: Record<string, unknown>
): Promise<ConnectionStatusResult> {
  const connections = await getUserPlatformConnections(user.id);
  
  // Group by category
  const meetingPlatforms = connections.filter(c => c.platformCategory === "meetings");
  const taskPlatforms = connections.filter(c => c.platformCategory === "tasks");
  const emailPlatforms = connections.filter(c => c.platformCategory === "email");
  
  // Build status text
  const lines: string[] = [
    `**Connected Platforms for ${user.name || user.email}**\n`,
  ];
  
  // Meetings
  lines.push("📹 **Meeting Platforms:**");
  if (meetingPlatforms.length > 0) {
    meetingPlatforms.forEach(c => {
      lines.push(`  ✅ ${capitalize(c.platform)} (${c.platformEmail || "connected"})`);
    });
  } else {
    lines.push("  ❌ None connected - Connect Zoom or Teams to access meetings");
  }
  
  // Tasks
  lines.push("\n📋 **Task Platforms:**");
  if (taskPlatforms.length > 0) {
    taskPlatforms.forEach(c => {
      lines.push(`  ✅ ${capitalize(c.platform)} (${c.platformEmail || "connected"})`);
    });
  } else {
    lines.push("  ❌ None connected - Connect Asana or Jira to create tasks");
  }
  
  // Email (future)
  if (emailPlatforms.length > 0) {
    lines.push("\n📧 **Email Platforms:**");
    emailPlatforms.forEach(c => {
      lines.push(`  ✅ ${capitalize(c.platform)} (${c.platformEmail || "connected"})`);
    });
  }
  
  // Add connection instructions if missing platforms
  if (meetingPlatforms.length === 0 || taskPlatforms.length === 0) {
    lines.push("\n---");
    lines.push("To connect platforms, visit your settings or click the button below.");
  }
  
  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
    _meta: {
      widget: {
        type: "connection-status",
        url: `${BASE_URL}/widgets/connection-status?userId=${user.id}`,
      },
    },
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

