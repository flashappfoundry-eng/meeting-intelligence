import { NextResponse } from "next/server";
import { z } from "zod";

const FeedbackSchema = z.object({
  tool: z.string(),
  meeting_id: z.string().optional(),
  rating: z.enum(["up", "down"]),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const payload = FeedbackSchema.parse(json);

    // MVP: non-blocking feedback capture.
    // In Phase 2 we can store this in `audit_log` or a dedicated table.
    console.log("[feedback]", payload);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid payload" },
      { status: 400 },
    );
  }
}


