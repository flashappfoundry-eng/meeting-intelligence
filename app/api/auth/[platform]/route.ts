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
import { oauthStates, users } from "@/lib/db/schema";

function isPlatform(x: string): x is OAuthPlatform {
  return x === "zoom" || x === "asana";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  let platformForLog: string | undefined;
  try {
    const { platform: platformParam } = await context.params;
    platformForLog = platformParam;
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

    // Ensure the user row exists, since oauth_states.user_id has an FK to users.id.
    // We don't have a full user provisioning flow yet, so we create a stable placeholder.
    const placeholderEmail = `user-${userUuid}@example.invalid`;
    await db
      .insert(users)
      .values({ id: userUuid, email: placeholderEmail })
      .onConflictDoNothing({ target: users.id });

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[oauth-start] error", {
      platform: platformForLog,
      message,
    });

    const lower = message.toLowerCase();

    if (
      lower.includes("missing_connection_string") ||
      lower.includes("no 'postgres_url'") ||
      lower.includes("no 'database_url'") ||
      lower.includes("vercel_postgres")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Database is not configured or reachable. OAuth requires Postgres to store PKCE state. Check POSTGRES_URL/DATABASE_URL and try again.",
        },
        { status: 500 },
      );
    }

    if (lower.includes("foreign key") && lower.includes("oauth_states")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to store OAuth state due to a database constraint. Please contact support.",
        },
        { status: 500 },
      );
    }

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


