import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { exchangeCodeForTokens } from "@/lib/auth/oauth";
import { saveUserTokens } from "@/lib/auth/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const errorUrl = new URL("/auth/zoom/error", request.url);

  if (providerError) {
    errorUrl.searchParams.set("error", providerError);
    return NextResponse.redirect(errorUrl);
  }

  if (!code || !state) {
    errorUrl.searchParams.set("error", "missing_code_or_state");
    return NextResponse.redirect(errorUrl);
  }

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("zoom_code_verifier")?.value ?? null;
  const expectedState = cookieStore.get("zoom_oauth_state")?.value ?? null;
  const userId = cookieStore.get("zoom_user_id")?.value ?? null;

  if (!codeVerifier || !expectedState || !userId) {
    errorUrl.searchParams.set("error", "missing_cookie_state");
    return NextResponse.redirect(errorUrl);
  }

  if (state !== expectedState) {
    errorUrl.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(errorUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens("zoom", code, codeVerifier);

    await saveUserTokens(
      userId,
      "zoom",
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

    cookieStore.delete("zoom_code_verifier");
    cookieStore.delete("zoom_oauth_state");
    cookieStore.delete("zoom_user_id");

    return NextResponse.redirect(new URL("/auth/zoom/success", request.url));
  } catch (err) {
    console.error("[zoom-oauth-callback] error", err);
    errorUrl.searchParams.set("error", "tokenexchangefailed");
    return NextResponse.redirect(errorUrl);
  }
}


