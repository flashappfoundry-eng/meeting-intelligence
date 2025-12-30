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

  const fallbackErrorRedirect = new URL("/", req.url);
  fallbackErrorRedirect.searchParams.set("error", "oauth_callback_failed");

  if (!isPlatform(platformParam)) {
    return NextResponse.redirect(fallbackErrorRedirect);
  }

  const errorUrl = new URL(`/auth/${platformParam}/error`, req.url);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      errorUrl.searchParams.set("error", error);
      return NextResponse.redirect(errorUrl);
    }
    if (!code || !state) {
      errorUrl.searchParams.set("error", "Missing code or state");
      return NextResponse.redirect(errorUrl);
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
      errorUrl.searchParams.set("error", "Invalid state");
      return NextResponse.redirect(errorUrl);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      errorUrl.searchParams.set("error", "State expired");
      return NextResponse.redirect(errorUrl);
    }
    if (!record.userId) {
      errorUrl.searchParams.set("error", "State missing user");
      return NextResponse.redirect(errorUrl);
    }
    if (!record.codeVerifier) {
      errorUrl.searchParams.set("error", "State missing code_verifier");
      return NextResponse.redirect(errorUrl);
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
  } catch (err) {
    console.error("OAuth callback error", err);
    errorUrl.searchParams.set(
      "error",
      "OAuth callback failed. Please try connecting again.",
    );
    return NextResponse.redirect(errorUrl);
  }
}


