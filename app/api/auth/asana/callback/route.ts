import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { exchangeCodeForTokens } from "@/lib/auth/oauth";
import { saveUserTokens } from "@/lib/auth/tokens";
import { db } from "@/lib/db/client";
import { oauthStates } from "@/lib/db/schema";

function toErrorCode(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // PKCE / auth-code issues from Asana commonly surface as invalid_grant.
  if (lower.includes("invalid_grant")) return "invalid_grant";
  if (lower.includes("code_verifier") || lower.includes("pkce")) return "pkce_failed";

  // Token encryption issues (TOKEN_ENCRYPTION_KEY missing/wrong format).
  if (lower.includes("token_encryption_key")) return "token_encryption_key_invalid";
  if (lower.includes("aes-256-gcm")) return "token_encryption_key_invalid";

  // Default
  return "tokenexchangefailed";
}

export async function GET(req: NextRequest) {
  const errorUrl = new URL("/auth/asana/error", req.url);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    if (providerError) {
      errorUrl.searchParams.set("error", providerError);
      return NextResponse.redirect(errorUrl);
    }

    if (!code || !state) {
      errorUrl.searchParams.set("error", "missing_code_or_state");
      return NextResponse.redirect(errorUrl);
    }

    const rows = await db
      .select()
      .from(oauthStates)
      .where(
        and(
          eq(oauthStates.platform, "asana"),
          eq(oauthStates.state, state),
          isNull(oauthStates.usedAt),
        ),
      )
      .limit(1);

    const record = rows[0];
    if (!record) {
      errorUrl.searchParams.set("error", "invalid_state");
      return NextResponse.redirect(errorUrl);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      errorUrl.searchParams.set("error", "state_expired");
      return NextResponse.redirect(errorUrl);
    }
    if (!record.userId) {
      errorUrl.searchParams.set("error", "state_missing_user");
      return NextResponse.redirect(errorUrl);
    }
    if (!record.codeVerifier) {
      errorUrl.searchParams.set("error", "state_missing_code_verifier");
      return NextResponse.redirect(errorUrl);
    }

    try {
      const tokens = await exchangeCodeForTokens("asana", code, record.codeVerifier);

      await saveUserTokens(
        record.userId,
        "asana",
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
    } catch (err) {
      // Critical: do not log raw tokens/secrets; only log the error object.
      console.error("[asana-oauth-callback] error", err);
      errorUrl.searchParams.set("error", toErrorCode(err));
      return NextResponse.redirect(errorUrl);
    }

    await db.delete(oauthStates).where(eq(oauthStates.id, record.id));

    const successUrl = record.redirectAfter?.trim()
      ? record.redirectAfter
      : new URL("/auth/asana/success", req.url).toString();

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("[asana-oauth-callback] error", err);
    errorUrl.searchParams.set("error", toErrorCode(err));
    return NextResponse.redirect(errorUrl);
  }
}
