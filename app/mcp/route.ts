import { NextResponse } from "next/server";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  toolSchemas,
  type ToolInput,
  type ToolName,
  type ToolOutput,
} from "@/lib/dx/schemas";
import { registerWidget } from "@/lib/dx/register-widget";
import { validateTranscriptForProcessing } from "@/lib/integrations/openai";
import { extractActionItems, generateMeetingSummary } from "@/lib/integrations/openai";
import { getUserTokens, refreshTokenIfNeeded } from "@/lib/auth/tokens";
import { createZoomClient } from "@/lib/integrations/zoom";
import { createAsanaClient } from "@/lib/integrations/asana";
import { coerceUserIdToUuid, deriveUserIdFromHeaders } from "@/lib/auth/user-id";

type TranscriptCacheEntry = {
  ownerUserId: string;
  transcriptId: string;
  transcriptText: string;
  meetingTitle?: string;
  meetingDate?: string;
  wordCount: number;
  estimatedDurationMinutes: number;
  createdAt: string;
};

declare global {
  var transcriptCache: Record<string, TranscriptCacheEntry> | undefined;
}

function getTranscriptCache() {
  globalThis.transcriptCache ??= {};
  return globalThis.transcriptCache;
}

function makeStubOutput<TName extends ToolName>(
  name: TName,
  input: ToolInput<TName>,
): ToolOutput<TName> {
  void input;
  switch (name) {
    default: {
      // Fallback stub for tools not wired in MVP.
      return {} as ToolOutput<TName>;
    }
  }
}

function requireUserId(userId: string | undefined) {
  // Always return a deterministic UUID, even if the upstream client didn't provide x-user-id.
  // We only show user-facing errors when a tool actually needs OAuth tokens.
  return coerceUserIdToUuid(userId ?? "anonymous-user");
}

async function requireZoomClient(userId: string) {
  const tokens = await getUserTokens(userId, "zoom");
  if (!tokens) {
    throw new Error("Please connect your Zoom account first");
  }
  const fresh = await refreshTokenIfNeeded(userId, "zoom", tokens);
  return createZoomClient(fresh.accessToken);
}

async function requireAsanaClient(userId: string) {
  const tokens = await getUserTokens(userId, "asana");
  if (!tokens) {
    throw new Error("Please connect your Asana account first");
  }
  const fresh = await refreshTokenIfNeeded(userId, "asana", tokens);
  return createAsanaClient(fresh.accessToken);
}

async function handleTool<TName extends ToolName>(
  name: TName,
  input: ToolInput<TName>,
  ctx: { baseUrl: string; userId?: string },
): Promise<ToolOutput<TName>> {
  const userId = requireUserId(ctx.userId);

  switch (name) {
    case "get_recent_meetings": {
      const limit = (input as ToolInput<"get_recent_meetings">).limit ?? 10;
      const zoom = await requireZoomClient(userId);
      const meetings = await zoom.listRecentMeetings(limit);

      return toolSchemas.get_recent_meetings.output.parse({
        meetings: meetings.map((m) => ({
          id: String(m.id),
          title: m.topic,
          started_at: m.start_time,
        })),
      }) as ToolOutput<TName>;
    }

    case "get_meeting_summary": {
      const { meeting_id } = input as ToolInput<"get_meeting_summary">;
      const cached = getTranscriptCache()[meeting_id];

      if (cached && cached.ownerUserId === userId) {
        const summary = await generateMeetingSummary({
          transcriptText: cached.transcriptText,
          meetingTitle: cached.meetingTitle,
          meetingDate: cached.meetingDate,
        });

        return toolSchemas.get_meeting_summary.output.parse({
          meeting_id,
          title: summary.title,
          started_at: cached.meetingDate,
          summary: summary.summary,
          topics: summary.topics,
          key_decisions: summary.key_decisions,
        }) as ToolOutput<TName>;
      }

      const zoom = await requireZoomClient(userId);
      const meeting = await zoom.getMeeting(meeting_id);

      return toolSchemas.get_meeting_summary.output.parse({
        meeting_id,
        title: meeting.topic ?? "Zoom meeting",
        started_at: meeting.start_time,
        summary:
          "Zoom meeting connected. Transcript-based summarization is not yet implemented for Zoom meetings in this MVP.",
        topics: [],
        key_decisions: [],
      }) as ToolOutput<TName>;
    }

    case "get_action_items": {
      const { meeting_id } = input as ToolInput<"get_action_items">;
      const cached = getTranscriptCache()[meeting_id];

      if (cached && cached.ownerUserId === userId) {
        const items = await extractActionItems({ transcriptText: cached.transcriptText });
        return toolSchemas.get_action_items.output.parse({
          meeting_id,
          items: items.map((it, idx) => ({
            id: `ai_${idx + 1}`,
            text: it.text,
            assignee: it.assignee,
            due_date: it.due_date,
          })),
        }) as ToolOutput<TName>;
      }

      // Still require Zoom connection for this tool, per docs.
      await requireZoomClient(userId);

      return toolSchemas.get_action_items.output.parse({
        meeting_id,
        items: [],
      }) as ToolOutput<TName>;
    }

    case "paste_transcript": {
      const { transcript_text, meeting_title, meeting_date } =
        input as ToolInput<"paste_transcript">;

      const validation = validateTranscriptForProcessing(transcript_text);
      if (!validation.safe) {
        throw new Error(validation.warning ?? "Transcript rejected.");
      }

      const words = transcript_text.trim().split(/\s+/).filter(Boolean);
      const word_count = words.length;
      const estimated_duration_minutes = Math.ceil(word_count / 150);
      const transcript_id = `manual-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;

      getTranscriptCache()[transcript_id] = {
        ownerUserId: userId,
        transcriptId: transcript_id,
        transcriptText: transcript_text,
        meetingTitle: meeting_title,
        meetingDate: meeting_date,
        wordCount: word_count,
        estimatedDurationMinutes: estimated_duration_minutes,
        createdAt: new Date().toISOString(),
      };

      return toolSchemas.paste_transcript.output.parse({
        transcript_id,
        word_count,
        estimated_duration_minutes,
        ready_for_analysis: true,
        preview: transcript_text.slice(0, 200),
      }) as ToolOutput<TName>;
    }

    case "create_tasks": {
      const { tasks } = input as ToolInput<"create_tasks">;
      const asana = await requireAsanaClient(userId);
      const me = await asana.getMe();
      const workspaceGid = me.workspaces?.[0]?.gid;
      if (!workspaceGid) {
        throw new Error("Asana user has no accessible workspaces to create tasks in.");
      }

      const created = [];
      for (const t of tasks) {
        const createdTask = await asana.createTask({ name: t.text, workspaceGid });
        created.push({ id: createdTask.gid, text: t.text });
      }

      return toolSchemas.create_tasks.output.parse({
        created,
      }) as ToolOutput<TName>;
    }

    default:
      return makeStubOutput(name, input);
  }
}

function createServer(baseUrl: string, userId: string | undefined) {
  const server = new McpServer(
    { name: "meeting-intelligence", version: "0.1.0" },
    { capabilities: {} },
  );

  const names = Object.keys(toolSchemas) as ToolName[];

  for (const name of names) {
    const schemas = toolSchemas[name];

    registerWidget(server, {
      name,
      baseUrl,
      loadingMessage: "Working…",
      loadedMessage: "Done.",
      handler: (input: ToolInput<typeof name>, _ctx) => {
        void _ctx;
        // Validate + dispatch
        const parsedInput = schemas.input.parse(input) as ToolInput<typeof name>;
        return handleTool(name, parsedInput, { baseUrl, userId });
      },
    });

    server.registerTool(
      name,
      {
        description: `Stub tool: ${name}`,
        inputSchema: schemas.input,
        outputSchema: schemas.output,
      },
      async (args: unknown, extra: unknown) => {
        // NOTE: This is the official MCP tool execution path. We still keep
        // tool stubs local and type-safe through DX schemas.
        void extra;

        const widget = (server as unknown as {
          __dxWidgets?: Record<
            string,
            {
              handler: (
                input: unknown,
                ctx: { baseUrl: string; userId?: string },
              ) => unknown | Promise<unknown>;
            }
          >;
        }).__dxWidgets?.[name];

        const structuredContent = widget
          ? await widget.handler(args, { baseUrl, userId })
          : makeStubOutput(name, args as ToolInput<typeof name>);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(structuredContent) },
          ],
          structuredContent: structuredContent as Record<string, unknown>,
        };
      },
    );
  }

  return server as unknown as typeof server & {
    __dxWidgets: Record<
      ToolName,
      {
        baseUrl: string;
        loadingMessage?: string;
        loadedMessage?: string;
        handler: (input: unknown, ctx: { baseUrl: string; userId?: string }) => unknown;
      }
    >;
  };
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const baseUrl = `${url.origin}/mcp`;

  // === MCP Request Logging (for debugging ChatGPT OAuth flow) ===
  const headersObj = Object.fromEntries(req.headers.entries());
  console.log("[MCP] === New Request ===");
  console.log("[MCP] All headers:", JSON.stringify(headersObj, null, 2));

  // ChatGPT MCP client won't forward arbitrary custom headers like x-user-id.
  // Prefer x-user-id if provided, otherwise derive a stable fallback identity
  // from OpenAI-specific headers or a deterministic hash of request traits.
  const derivedUserId = deriveUserIdFromHeaders(req.headers);
  console.log("[MCP] Derived userId:", derivedUserId);

  // Log specific headers we care about
  console.log("[MCP] Specific headers:", {
    "x-user-id": req.headers.get("x-user-id"),
    "x-openai-user-id": req.headers.get("x-openai-user-id"),
    "x-openai-sub": req.headers.get("x-openai-sub"),
    "x-openai-conversation-id": req.headers.get("x-openai-conversation-id"),
  });

  // Check if tokens exist for this derived user
  const zoomTokens = await getUserTokens(derivedUserId, "zoom");
  const asanaTokens = await getUserTokens(derivedUserId, "asana");
  console.log("[MCP] Token status:", {
    derivedUserId,
    hasZoomTokens: !!zoomTokens,
    hasAsanaTokens: !!asanaTokens,
  });

  const userId = derivedUserId;
  const server = createServer(baseUrl, userId);

  // Official MCP transport for Web Standard Request/Response.
  // (The Node.js StreamableHTTPServerTransport uses IncomingMessage/ServerResponse.)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close();
    await server.close();
  }
}


