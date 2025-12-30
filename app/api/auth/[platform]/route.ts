import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildAuthUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  type OAuthPlatform,
} from "@/lib/auth/oauth";
import { coerceUserIdToUuid } from "@/lib/auth/user-id";
import { db } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

function isPlatform(x: string): x is OAuthPlatform {
  return x === "zoom" || x === "asana";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await context.params;
  if (!isPlatform(platformParam)) {
    return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
  }

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Missing x-user-id header" }, { status: 401 });
  }
  const userUuid = coerceUserIdToUuid(userId);

  // Optional: allow callers to stash a post-success redirect.
  const url = new URL(req.url);
  const redirectUrl = url.searchParams.get("redirectUrl") ?? url.searchParams.get("redirect") ?? null;

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(oauthStates).values({
    state,
    provider: platformParam,
    userId: userUuid,
    redirectUri: redirectUrl,
    codeVerifier,
    expiresAt,
  });

  const authUrl = buildAuthUrl({
    platform: platformParam,
    state,
    codeChallenge,
    userId: userUuid,
  });

  return NextResponse.json({ ok: true, url: authUrl });
}


