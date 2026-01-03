// app/mcp/route.ts
/**
 * MCP (Model Context Protocol) Server Endpoint
 * 
 * This is the main entry point for ChatGPT to interact with Meeting Intelligence.
 * All requests are authenticated via OAuth Bearer tokens.
 */

import { NextResponse } from "next/server";
import {
  authenticateMCPRequest,
  buildAuthRequiredResponse,
  hasScope,
  getUserPlatformConnection,
  type AuthenticatedUser,
} from "@/lib/auth/mcp-auth";

// Import tool handlers
import { handleGetRecentMeetings } from "@/lib/mcp/tools/get-recent-meetings";
import { handleGetMeetingSummary } from "@/lib/mcp/tools/get-meeting-summary";
import { handleGetActionItems } from "@/lib/mcp/tools/get-action-items";
import { handleCreateTasks } from "@/lib/mcp/tools/create-tasks";
import { handlePasteTranscript } from "@/lib/mcp/tools/paste-transcript";
import { handleGetConnectionStatus } from "@/lib/mcp/tools/get-connection-status";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// Tool definitions with required scopes and annotations
const TOOLS = {
  getRecentMeetings: {
    name: "getRecentMeetings",
    description: "List recent meetings from your connected Zoom account. Returns meeting titles, dates, durations, and IDs for further analysis.",
    requiredScopes: ["meetings:read"],
    requiresPlatform: "zoom",
    annotations: {
      readOnlyHint: true,      // Skips confirmation - just reads data
      openWorldHint: true,     // Accesses Zoom API
      destructiveHint: false,
    },
  },
  getMeetingSummary: {
    name: "getMeetingSummary",
    description: "Get an AI-generated summary of a specific meeting including key topics, decisions, and highlights.",
    requiredScopes: ["meetings:read", "meetings:summary"],
    requiresPlatform: "zoom",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  getActionItems: {
    name: "getActionItems", 
    description: "Extract action items and tasks from a meeting transcript. Returns structured list with assignees, due dates, and priorities.",
    requiredScopes: ["meetings:read", "meetings:summary"],
    requiresPlatform: null,
    annotations: {
      readOnlyHint: true,      // Analysis only, no writes
      openWorldHint: true,     // Uses OpenAI for extraction
      destructiveHint: false,
    },
  },
  createTasks: {
    name: "createTasks",
    description: "Create tasks in Asana from action items. Batch creates multiple tasks at once with titles, due dates, and priorities in your connected Asana workspace and project.",
    requiredScopes: ["tasks:write"],
    requiresPlatform: "asana",
    annotations: {
      readOnlyHint: false,     // WRITES data to Asana
      openWorldHint: true,     // Accesses Asana API
      destructiveHint: false,  // Creates tasks, doesn't delete
    },
  },
  pasteTranscript: {
    name: "pasteTranscript",
    description: "Process a pasted meeting transcript to extract summary and action items. Use this when you have transcript text to analyze.",
    requiredScopes: ["meetings:summary"],
    requiresPlatform: null,
    annotations: {
      readOnlyHint: true,      // Just processes text
      openWorldHint: true,     // Uses OpenAI
      destructiveHint: false,
    },
  },
  getConnectionStatus: {
    name: "getConnectionStatus",
    description: "Check which platforms (Zoom, Asana) are connected and their current status. Shows connection health and available workspaces.",
    requiredScopes: [],
    requiresPlatform: null,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,    // Internal database only
      destructiveHint: false,
    },
  },
};

// CORS headers for all responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

/**
 * MCP Health Check
 */
export async function GET() {
  return NextResponse.json({
    name: "meeting-intelligence",
    version: "2.0.0",
    status: "healthy",
    service: "meeting-intelligence-mcp",
    timestamp: new Date().toISOString(),
    endpoints: {
      mcp: `${BASE_URL}/mcp`,
      oauth: `${BASE_URL}/.well-known/oauth-protected-resource`,
      openid: `${BASE_URL}/.well-known/openid-configuration`,
    },
  }, {
    headers: CORS_HEADERS,
  });
}

/**
 * MCP JSON-RPC Handler
 */
export async function POST(request: Request) {
  console.log("[MCP] === New Request ===");
  
  // Authenticate the request
  const authResult = await authenticateMCPRequest(request);
  
  if (!authResult.authenticated || !authResult.user) {
    console.log("[MCP] Authentication failed:", authResult.errorCode);
    
    // Return auth required response
    return NextResponse.json(
      buildAuthRequiredResponse(
        authResult.errorCode || "unknown",
        authResult.error || "Authentication required"
      ),
      { status: 401 }
    );
  }
  
  const user = authResult.user;
  console.log("[MCP] Authenticated user:", user.email);
  
  // Parse JSON-RPC request
  let rpcRequest;
  try {
    rpcRequest = await request.json();
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32700,
        message: "Parse error: Invalid JSON",
      },
      id: null,
    }, { status: 400 });
  }
  
  const { method, params, id } = rpcRequest;
  console.log("[MCP] Method:", method, "ID:", id);
  
  // Handle JSON-RPC methods
  try {
    switch (method) {
      case "initialize":
        return handleInitialize(id);
      
      case "tools/list":
        return handleToolsList(id);
      
      case "tools/call":
        return handleToolCall(id, params, user);
      
      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
          id,
        });
    }
  } catch (error) {
    console.error("[MCP] Error handling request:", error);
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
      id,
    });
  }
}

/**
 * Handle initialize method
 */
function handleInitialize(id: string | number) {
  return NextResponse.json({
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "meeting-intelligence",
        version: "2.0.0",
      },
      capabilities: {
        tools: {},
      },
    },
    id,
  });
}

/**
 * Handle tools/list method
 */
function handleToolsList(id: string | number) {
  const tools = Object.values(TOOLS).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: getToolInputSchema(tool.name),
    annotations: tool.annotations,
  }));
  
  return NextResponse.json({
    jsonrpc: "2.0",
    result: { tools },
    id,
  });
}

/**
 * Handle tools/call method
 */
async function handleToolCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  user: AuthenticatedUser
) {
  const { name: toolName, arguments: toolArgs = {} } = params;
  
  console.log("[MCP] Tool call:", toolName);
  
  // Find tool definition
  const tool = TOOLS[toolName as keyof typeof TOOLS];
  if (!tool) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: -32602,
        message: `Unknown tool: ${toolName}`,
      },
      id,
    });
  }
  
  // Check required scopes
  for (const scope of tool.requiredScopes) {
    if (!hasScope(user, scope)) {
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: `Missing required scope: ${scope}`,
          data: { requiredScopes: tool.requiredScopes },
        },
        id,
      });
    }
  }
  
  // Check platform connection if required
  if (tool.requiresPlatform) {
    const connection = await getUserPlatformConnection(user.id, tool.requiresPlatform);
    if (!connection) {
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          content: [
            {
              type: "text",
              text: `Please connect your ${tool.requiresPlatform.charAt(0).toUpperCase() + tool.requiresPlatform.slice(1)} account first.`,
            },
          ],
          _meta: {
            widget: {
              type: "connection-status",
              url: `${BASE_URL}/widgets/connection-status?userId=${user.id}&platform=${tool.requiresPlatform}`,
            },
          },
        },
        id,
      });
    }
  }
  
  // Execute tool
  let result;
  switch (toolName) {
    case "getRecentMeetings":
      result = await handleGetRecentMeetings(user, toolArgs);
      break;
    case "getMeetingSummary":
      result = await handleGetMeetingSummary(user, toolArgs);
      break;
    case "getActionItems":
      result = await handleGetActionItems(user, toolArgs);
      break;
    case "createTasks":
      result = await handleCreateTasks(user, toolArgs);
      break;
    case "pasteTranscript":
      result = await handlePasteTranscript(user, toolArgs);
      break;
    case "getConnectionStatus":
      result = await handleGetConnectionStatus(user, toolArgs);
      break;
    default:
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: `Tool not implemented: ${toolName}`,
        },
        id,
      });
  }
  
  return NextResponse.json({
    jsonrpc: "2.0",
    result,
    id,
  });
}

/**
 * Get input schema for a tool
 */
function getToolInputSchema(toolName: string): object {
  switch (toolName) {
    case "getRecentMeetings":
      return {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["zoom", "teams", "meet"],
            description: "Meeting platform to query (default: zoom)",
          },
          limit: {
            type: "number",
            description: "Maximum number of meetings to return (default: 10)",
          },
        },
      };
    
    case "getMeetingSummary":
      return {
        type: "object",
        properties: {
          meetingId: {
            type: "string",
            description: "The meeting ID to summarize",
          },
          platform: {
            type: "string",
            enum: ["zoom", "teams", "meet"],
          },
        },
        required: ["meetingId"],
      };
    
    case "getActionItems":
      return {
        type: "object",
        properties: {
          meetingId: {
            type: "string",
            description: "The Zoom meeting ID to extract action items from (fetches transcript from cloud recording)",
          },
          transcript: {
            type: "string",
            description: "Raw transcript text to analyze directly (use this if you don't have a meeting ID)",
          },
          meetingTitle: {
            type: "string",
            description: "Optional title for the meeting (helps provide context)",
          },
        },
        description: "Provide either meetingId (to fetch from Zoom) OR transcript (direct text). Returns structured action items with assignees, due dates, and priorities.",
      };
    
    case "createTasks":
      return {
        type: "object",
        properties: {
          actionItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Task title/description" },
                assignee: { type: "string", description: "Person responsible for the task" },
                dueDate: { type: "string", description: "Due date (e.g., '2026-01-10', 'Friday', 'next week')" },
                priority: { 
                  type: "string", 
                  enum: ["high", "medium", "low"],
                  description: "Task priority - high for urgent/ASAP/blocking items, low for nice-to-have, medium for normal tasks"
                },
                context: { type: "string", description: "Additional context about the task" },
              },
              required: ["title"],
            },
            description: "Action items to create as tasks. Include priority for each item!",
          },
          platform: {
            type: "string",
            enum: ["asana", "jira", "notion"],
            description: "Task platform (default: asana)",
          },
          projectId: {
            type: "string",
            description: "Target project/workspace ID",
          },
        },
        required: ["actionItems"],
      };
    
    case "pasteTranscript":
      return {
        type: "object",
        properties: {
          transcript: {
            type: "string",
            description: "The meeting transcript text",
          },
          meetingTitle: {
            type: "string",
            description: "Optional title for the meeting",
          },
        },
        required: ["transcript"],
      };
    
    case "getConnectionStatus":
      return {
        type: "object",
        properties: {},
      };
    
    default:
      return { type: "object", properties: {} };
  }
}

/**
 * CORS preflight handler
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}
