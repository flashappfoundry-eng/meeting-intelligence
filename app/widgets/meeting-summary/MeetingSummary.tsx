"use client";

import * as React from "react";

import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";

import { useCallTool, useToolInfo, useWidgetState } from "@/lib/dx/hooks";
import { LLMText, ModelSyncProvider } from "@/lib/dx/model-sync";
import type { ToolOutput } from "@/lib/dx/schemas";

type SummaryOutput = ToolOutput<"get_meeting_summary">;

function formatMaybeDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function MeetingSummary() {
  const tool = useToolInfo("get_meeting_summary");
  const { callTool, isLoading, error } = useCallTool();

  const { state: meetingId } = useWidgetState<string>("meetingId", "meeting_1");
  const [output, setOutput] = React.useState<SummaryOutput | null>(null);
  const [feedbackStatus, setFeedbackStatus] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await callTool("get_meeting_summary", { meeting_id: meetingId });
      if (!cancelled) setOutput(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [callTool, meetingId]);

  return (
    <ModelSyncProvider>
      <div className="w-full rounded-2xl border border-default bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-secondary text-sm">Widget</p>
            <LLMText value={`Meeting summary for: ${output?.title ?? "…"}`}>
              <h2 className="mt-1 heading-lg truncate">
                {output?.title ?? "Meeting Summary"}
              </h2>
            </LLMText>
            <p className="mt-1 text-xs text-secondary">
              Tool: <span className="font-mono">{tool.name}</span>
            </p>
          </div>
          <Badge color="info">Stub</Badge>
        </div>

        <div className="mt-4 grid gap-3">
          {isLoading && (
            <p className="text-sm text-secondary">Loading meeting summary…</p>
          )}

          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
              <p className="font-medium">Something went wrong</p>
              <p className="text-secondary">
                {(error as Error)?.message ?? "Unknown error"}
              </p>
            </div>
          ) : null}

          {output && !isLoading && !error && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="font-medium text-secondary">Meeting</dt>
                <dd className="text-right">{output.title}</dd>
                <dt className="font-medium text-secondary">Date</dt>
                <dd className="text-right">
                  {formatMaybeDate(output.started_at)}
                </dd>
              </dl>

              <div className="rounded-xl border border-subtle bg-surface px-3 py-2">
                <p className="text-sm font-medium">Summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">
                  {output.summary}
                </p>
              </div>

              {output.topics?.length ? (
                <div className="rounded-xl border border-subtle bg-surface px-3 py-2">
                  <p className="text-sm font-medium">Topics</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-secondary">
                    {output.topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {output.key_decisions?.length ? (
                <div className="rounded-xl border border-subtle bg-surface px-3 py-2">
                  <p className="text-sm font-medium">Key decisions</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-secondary">
                    {output.key_decisions.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-2 rounded-xl border border-subtle bg-surface px-3 py-2">
                <p className="text-sm font-medium">Was this helpful?</p>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    color="secondary"
                    variant="soft"
                    size="sm"
                    loading={feedbackStatus === "sending"}
                    onClick={async () => {
                      try {
                        setFeedbackStatus("sending");
                        await fetch("/api/feedback", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            tool: "get_meeting_summary",
                            meeting_id: output.meeting_id,
                            rating: "up",
                          }),
                        });
                        setFeedbackStatus("sent");
                      } catch {
                        setFeedbackStatus("error");
                      }
                    }}
                  >
                    👍
                  </Button>
                  <Button
                    color="secondary"
                    variant="soft"
                    size="sm"
                    loading={feedbackStatus === "sending"}
                    onClick={async () => {
                      try {
                        setFeedbackStatus("sending");
                        await fetch("/api/feedback", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            tool: "get_meeting_summary",
                            meeting_id: output.meeting_id,
                            rating: "down",
                          }),
                        });
                        setFeedbackStatus("sent");
                      } catch {
                        setFeedbackStatus("error");
                      }
                    }}
                  >
                    👎
                  </Button>
                  <span className="text-xs text-secondary">
                    {feedbackStatus === "sent"
                      ? "Thanks!"
                      : feedbackStatus === "error"
                        ? "Couldn’t send feedback."
                        : " "}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ModelSyncProvider>
  );
}


