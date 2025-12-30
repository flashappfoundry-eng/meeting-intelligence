"use client";

import * as React from "react";

import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";

import { useCallTool, useToolInfo, useWidgetState } from "@/lib/dx/hooks";
import type { ToolOutput } from "@/lib/dx/schemas";

type CreateTasksOutput = ToolOutput<"create_tasks">;

export function TaskConfirmation() {
  const tool = useToolInfo("create_tasks");
  const { callTool, isLoading, error } = useCallTool();

  const { state: meetingId } = useWidgetState<string>("meetingId", "meeting_1");
  const [output, setOutput] = React.useState<CreateTasksOutput | null>(null);

  const run = React.useCallback(async () => {
    const result = await callTool("create_tasks", {
      meeting_id: meetingId,
      tasks: [{ text: "Stub task: follow up" }, { text: "Stub task: schedule next sync" }],
    });
    setOutput(result);
  }, [callTool, meetingId]);

  React.useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="w-full rounded-2xl border border-default bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-secondary text-sm">Widget</p>
          <h2 className="mt-1 heading-lg">Task Confirmation</h2>
          <p className="mt-1 text-xs text-secondary">
            Tool: <span className="font-mono">{tool.name}</span>
          </p>
        </div>
        <Badge color="info">Stub</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        {isLoading && <p className="text-sm text-secondary">Loading…</p>}

        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
            <p className="font-medium">Something went wrong</p>
            <p className="text-secondary">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
          </div>
        ) : null}

        {output ? (
          <div className="rounded-xl border border-subtle bg-surface px-3 py-2">
            <p className="text-sm font-medium">Created tasks</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-secondary">
              {output.created.map((t) => (
                <li key={t.id}>
                  <span className="font-mono">{t.id}</span>: {t.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button color="secondary" variant="soft" onClick={run}>
          Refresh (stub)
        </Button>
      </div>
    </div>
  );
}


