"use client";

import * as React from "react";

import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";

import { useCallTool, useToolInfo, useWidgetState } from "@/lib/dx/hooks";
import type { ToolOutput } from "@/lib/dx/schemas";

type RecentMeetingsOutput = ToolOutput<"get_recent_meetings">;

function formatMaybeDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function MeetingList() {
  const tool = useToolInfo("get_recent_meetings");
  const { callTool, isLoading, error } = useCallTool();

  const [output, setOutput] = React.useState<RecentMeetingsOutput | null>(null);

  const { state: selectedMeetingId, setState: setSelectedMeetingId } =
    useWidgetState<string | null>("selectedMeetingId", null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await callTool("get_recent_meetings", { limit: 10 });
      if (!cancelled) setOutput(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [callTool]);

  return (
    <div className="w-full rounded-2xl border border-default bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-secondary text-sm">Widget</p>
          <h2 className="mt-1 heading-lg">Meeting List</h2>
          <p className="mt-1 text-xs text-secondary">
            Tool: <span className="font-mono">{tool.name}</span>
          </p>
        </div>
        <Badge color="info">Stub</Badge>
      </div>

      <div className="mt-4">
        {isLoading && (
          <p className="text-sm text-secondary">Loading recent meetings…</p>
        )}

        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
            <p className="font-medium">Something went wrong</p>
            <p className="text-secondary">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
          </div>
        ) : null}

        {!isLoading && !error && output?.meetings?.length ? (
          <ul className="mt-2 grid gap-2">
            {output.meetings.map((m) => {
              const selected = selectedMeetingId === m.id;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.title ?? "Untitled meeting"}
                    </p>
                    <p className="text-xs text-secondary">
                      {formatMaybeDate(m.started_at)}
                    </p>
                  </div>
                  <Button
                    color="secondary"
                    variant="soft"
                    size="sm"
                    selected={selected}
                    onClick={() => setSelectedMeetingId(m.id)}
                  >
                    {selected ? "Selected" : "Select"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!isLoading && !error && output && output.meetings.length === 0 && (
          <p className="text-sm text-secondary">No meetings found.</p>
        )}
      </div>
    </div>
  );
}


