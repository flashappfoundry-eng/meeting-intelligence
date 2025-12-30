"use client";

import * as React from "react";

type OAuthInitResponse = { ok: boolean; url?: string; error?: string };

export default function HomePage() {
  const [loading, setLoading] = React.useState<"zoom" | "asana" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function connect(platform: "zoom" | "asana") {
    setError(null);
    setLoading(platform);
    try {
      const res = await fetch(`/api/auth/${platform}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "test-user-123",
        },
      });

      const data = (await res.json()) as OAuthInitResponse;
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Failed to start ${platform} OAuth`);
      }

      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="w-full max-w-lg">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Meeting Intelligence - OAuth Setup
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Connect your accounts to get started with Meeting Intelligence
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => connect("zoom")}
              disabled={loading !== null}
              className="h-12 w-full rounded-xl bg-zinc-900 px-4 text-base font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading === "zoom" ? "Connecting..." : "Connect Zoom"}
            </button>

            <button
              type="button"
              onClick={() => connect("asana")}
              disabled={loading !== null}
              className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              {loading === "asana" ? "Connecting..." : "Connect Asana"}
            </button>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
            Tip: If you haven’t configured your OAuth app credentials yet, set the required env
            vars and try again.
          </p>
        </div>
      </main>
    </div>
  );
}


