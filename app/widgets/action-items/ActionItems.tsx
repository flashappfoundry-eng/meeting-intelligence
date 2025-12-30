"use client";

import * as React from "react";

import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Checkbox } from "@openai/apps-sdk-ui/components/Checkbox";

import { useCallTool, useToolInfo, useWidgetState } from "@/lib/dx/hooks";
import type { ToolOutput } from "@/lib/dx/schemas";

type ActionItemsOutput = ToolOutput<"get_action_items">;

export function ActionItems() {
  const tool = useToolInfo("get_action_items");
  const { callTool, isLoading, error } = useCallTool();

  const { state: meetingId } = useWidgetState<string>("meetingId", "meeting_1");
  const [output, setOutput] = React.useState<ActionItemsOutput | null>(null);

  const {
    state: selectedActionItemIds,
    setState: setSelectedActionItemIds,
  } = useWidgetState<string[]>("selectedActionItems", []);

  const [createResult, setCreateResult] = React.useState<ToolOutput<"create_tasks"> | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await callTool("get_action_items", { meeting_id: meetingId });
      if (!cancelled) setOutput(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [callTool, meetingId]);

  const toggle = React.useCallback(
    (id: string, next: boolean) => {
      setSelectedActionItemIds((prev) => {
        const set = new Set(prev);
        if (next) set.add(id);
        else set.delete(id);
        return Array.from(set);
      });
    },
    [setSelectedActionItemIds],
  );

  const onCreateTasks = React.useCallback(async () => {
    const items = output?.items ?? [];
    const selected = items.filter((i) => selectedActionItemIds.includes(i.id));
    const tasks = selected.map((i) => ({ text: i.text }));
    const result = await callTool("create_tasks", { meeting_id: meetingId, tasks });
    setCreateResult(result);
  }, [callTool, meetingId, output, selectedActionItemIds]);

  return (
    <div className="w-full rounded-2xl border border-default bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-secondary text-sm">Widget</p>
          <h2 className="mt-1 heading-lg">Action Items</h2>
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

        {!isLoading && !error && output?.items?.length ? (
          <ul className="grid gap-2">
            {output.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-subtle bg-surface px-3 py-2"
              >
                <Checkbox
                  checked={selectedActionItemIds.includes(item.id)}
                  label={
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{item.text}</span>
                      {item.assignee ? (
                        <span className="text-xs text-secondary">
                          Assignee: {item.assignee}
                        </span>
                      ) : null}
                    </div>
                  }
                  onCheckedChange={(next) => toggle(item.id, next)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          color="primary"
          loading={isLoading}
          disabled={!selectedActionItemIds.length}
          onClick={onCreateTasks}
        >
          Create tasks ({selectedActionItemIds.length})
        </Button>

        {createResult ? (
          <div className="rounded-xl border border-subtle bg-surface px-3 py-2">
            <p className="text-sm font-medium">Created (stub)</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-secondary">
              {createResult.created.map((t) => (
                <li key={t.id}>
                  <span className="font-mono">{t.id}</span>: {t.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}


