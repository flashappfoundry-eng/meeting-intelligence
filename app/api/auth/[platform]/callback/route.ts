import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { exchangeCodeForTokens, type OAuthPlatform } from "@/lib/auth/oauth";
import { saveUserTokens } from "@/lib/auth/tokens";
import { db } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

function isPlatform(x: string): x is OAuthPlatform {
  return x === "zoom" || x === "asana";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await context.params;
  if (!isPlatform(platformParam)) {
    return NextResponse.json({ ok: false, error: "Invalid platform" }, { status: 400 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json(
      { ok: false, error: "Missing code or state" },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(oauthStates)
    .where(
      and(
        eq(oauthStates.provider, platformParam),
        eq(oauthStates.state, state),
        isNull(oauthStates.consumedAt),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) {
    return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "State expired" }, { status: 400 });
  }
  if (!record.userId) {
    return NextResponse.json({ ok: false, error: "State missing user" }, { status: 400 });
  }
  if (!record.codeVerifier) {
    return NextResponse.json({ ok: false, error: "State missing code_verifier" }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(platformParam, code, record.codeVerifier);

  await saveUserTokens(
    record.userId,
    platformParam,
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      scope: tokens.scope,
    },
    undefined,
    undefined,
    tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : undefined,
  );

  await db.delete(oauthStates).where(eq(oauthStates.id, record.id));

  const successUrl = record.redirectUri?.trim()
    ? record.redirectUri
    : new URL(`/auth/${platformParam}/success`, req.url).toString();

  return NextResponse.redirect(successUrl);
}


