import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildAuthUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  type OAuthPlatform,
} from "@/lib/auth/oauth";
import { coerceUserIdToUuid, deriveUserIdFromHeaders } from "@/lib/auth/user-id";
import { db } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

function isPlatform(x: string): x is OAuthPlatform {
  return x === "zoom" || x === "asana";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform: platformParam } = await context.params;
    if (!isPlatform(platformParam)) {
      return NextResponse.json({ ok: false, error: "Unsupported platform" }, { status: 400 });
    }

    // Prefer explicit x-user-id, but gracefully derive an identity when absent.
    const rawUserId = deriveUserIdFromHeaders(req.headers);
    const userUuid = coerceUserIdToUuid(rawUserId);

    // Validate required env vars per provider (avoid throwing inside buildAuthUrl).
    if (platformParam === "zoom") {
      if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_REDIRECT_URI) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Zoom OAuth is not configured. Set ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, and ZOOM_REDIRECT_URI.",
          },
          { status: 500 },
        );
      }
    } else {
      if (!process.env.ASANA_CLIENT_ID || !process.env.ASANA_CLIENT_SECRET || !process.env.ASANA_REDIRECT_URI) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Asana OAuth is not configured. Set ASANA_CLIENT_ID, ASANA_CLIENT_SECRET, and ASANA_REDIRECT_URI.",
          },
          { status: 500 },
        );
      }
    }

    // Optional: allow callers to stash a post-success redirect.
    const url = new URL(req.url);
    const redirectUrl =
      url.searchParams.get("redirectUrl") ?? url.searchParams.get("redirect") ?? null;

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
  } catch (err) {
    console.error("OAuth start error", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to start OAuth for this provider. Please verify env vars and try again.",
      },
      { status: 500 },
    );
  }
}


