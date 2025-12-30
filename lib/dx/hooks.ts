"use client";

import * as React from "react";

import {
  toolSchemas,
  type ToolInput,
  type ToolName,
  type ToolOutput,
} from "./schemas";

export function useToolInfo<TName extends ToolName>(name: TName) {
  return React.useMemo(() => {
    const schemas = toolSchemas[name];
    return {
      name,
      input: schemas.input,
      output: schemas.output,
    } as const;
  }, [name]);
}

function makeStubOutput<TName extends ToolName>(
  name: TName,
  input: ToolInput<TName>,
): ToolOutput<TName> {
  switch (name) {
    case "get_recent_meetings": {
      return toolSchemas.get_recent_meetings.output.parse({
        meetings: [
          {
            id: "meeting_1",
            title: "Weekly Sync",
            started_at: new Date().toISOString(),
          },
        ],
      }) as ToolOutput<TName>;
    }
    case "get_meeting_summary": {
      const meeting_id = (input as ToolInput<"get_meeting_summary">).meeting_id;
      return toolSchemas.get_meeting_summary.output.parse({
        meeting_id,
        title: "Stub Meeting",
        started_at: new Date().toISOString(),
        summary: "This is a stubbed meeting summary.",
        topics: ["Status", "Risks", "Next steps"],
        key_decisions: ["Proceed with the stub implementation"],
      }) as ToolOutput<TName>;
    }
    case "get_action_items": {
      const meeting_id = (input as ToolInput<"get_action_items">).meeting_id;
      return toolSchemas.get_action_items.output.parse({
        meeting_id,
        items: [
          {
            id: "ai_1",
            text: "Follow up on next steps",
            assignee: "Owner",
          },
        ],
      }) as ToolOutput<TName>;
    }
    case "create_tasks": {
      const { tasks } = input as ToolInput<"create_tasks">;
      return toolSchemas.create_tasks.output.parse({
        created: tasks.map((t, idx) => ({ id: `task_${idx + 1}`, text: t.text })),
      }) as ToolOutput<TName>;
    }
    case "paste_transcript": {
      const { transcript_text } = input as ToolInput<"paste_transcript">;
      const words = transcript_text.trim().split(/\s+/).filter(Boolean);
      const word_count = words.length;
      const estimated_duration_minutes = Math.ceil(word_count / 150);
      return toolSchemas.paste_transcript.output.parse({
        transcript_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        word_count,
        estimated_duration_minutes,
        ready_for_analysis: true,
        preview: transcript_text.slice(0, 200),
      }) as ToolOutput<TName>;
    }
    default: {
      // Exhaustiveness guard.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = name;
      return {} as ToolOutput<TName>;
    }
  }
}

export function useCallTool() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const callTool = React.useCallback(
    async <TName extends ToolName>(
      name: TName,
      input: ToolInput<TName>,
    ): Promise<ToolOutput<TName>> => {
      setIsLoading(true);
      setError(null);

      try {
        // Stub: validate input and return a schema-valid placeholder output.
        const parsed = toolSchemas[name].input.safeParse(input);
        if (!parsed.success) {
          console.warn("[dx] invalid tool input", name, parsed.error.flatten());
        }

        console.log("[dx] callTool (stub)", name, input);

        return makeStubOutput(name, input);
      } catch (e) {
        setError(e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { callTool, isLoading, error } as const;
}

export function useWidgetState<T>(key: string, initial: T) {
  void key;
  const [state, setState] = React.useState<T>(initial);

  return {
    state,
    setState,
    isLoading: false as const,
  } as const;
}



