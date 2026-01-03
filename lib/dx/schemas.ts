import { z } from "zod";

export const toolSchemas = {
  get_recent_meetings: {
    input: z.object({
      limit: z.number().int().positive().optional(),
    }),
    output: z.object({
      meetings: z.array(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          started_at: z.string().optional(),
        }),
      ),
    }),
  },

  get_meeting_summary: {
    input: z.object({
      meeting_id: z.string(),
    }),
    output: z.object({
      meeting_id: z.string(),
      title: z.string(),
      started_at: z.string().optional(),
      summary: z.string(),
      topics: z.array(z.string()).optional(),
      key_decisions: z.array(z.string()).optional(),
    }),
  },

  get_action_items: {
    input: z.object({
      meeting_id: z.string(),
    }),
    output: z.object({
      meeting_id: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          assignee: z.string().optional(),
          due_date: z.string().optional(),
        }),
      ),
    }),
  },

  create_tasks: {
    input: z.object({
      meeting_id: z.string().optional(),
      tasks: z.array(
        z.object({
          text: z.string(),
        }),
      ),
    }),
    output: z.object({
      created: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
        }),
      ),
    }),
  },

  paste_transcript: {
    input: z.object({
      transcript_text: z.string(),
      meeting_title: z.string().optional(),
      meeting_date: z.string().optional(),
    }),
    output: z.object({
      transcript_id: z.string(),
      word_count: z.number().int().nonnegative(),
      estimated_duration_minutes: z.number().int().nonnegative(),
      ready_for_analysis: z.boolean(),
      preview: z.string(),
    }),
  },
} as const;

export type ToolName = keyof typeof toolSchemas;

export type ToolInput<TName extends ToolName> = z.infer<
  (typeof toolSchemas)[TName]["input"]
>;

export type ToolOutput<TName extends ToolName> = z.infer<
  (typeof toolSchemas)[TName]["output"]
>;

/**
 * Phase 2 tools (NOT wired into MCP or widgets in MVP).
 */
export const phase2ToolSchemas = {
  draft_followup_email: {
    input: z.object({
      meeting_id: z.string(),
      tone: z.enum(["friendly", "formal"]).optional(),
    }),
    output: z.object({
      subject: z.string(),
      body: z.string(),
    }),
  },
} as const;

export type Phase2ToolName = keyof typeof phase2ToolSchemas;

// ============================================
// Action Item Schemas
// ============================================

/**
 * Schema for individual action items extracted from meetings
 */
export const ActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(), // ISO date or relative like "Friday"
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  context: z.string().nullable(), // Discussion topic this came from
  completed: z.boolean().default(false),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

/**
 * Schema for the getActionItems tool output
 */
export const GetActionItemsOutputSchema = z.object({
  meetingId: z.string().optional(),
  meetingTitle: z.string().optional(),
  meetingDate: z.string().optional(),
  actionItems: z.array(ActionItemSchema),
  extractedAt: z.string(), // ISO timestamp
  message: z.string().optional(), // Optional message (e.g., for empty results)
});

export type GetActionItemsOutput = z.infer<typeof GetActionItemsOutputSchema>;

/**
 * Schema for the getActionItems tool input
 */
export const GetActionItemsInputSchema = z.object({
  meetingId: z.string().optional(),
  transcript: z.string().optional(),
  meetingTitle: z.string().optional(),
}).refine(
  (data) => data.meetingId || data.transcript,
  { message: "Either meetingId or transcript must be provided" }
);

export type GetActionItemsInput = z.infer<typeof GetActionItemsInputSchema>;

