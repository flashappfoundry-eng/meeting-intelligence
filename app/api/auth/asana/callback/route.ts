import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/auth/oauth";
import { saveTokens } from "@/lib/auth/tokens";

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
  return "token_exchange_failed";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  console.log("[Asana Callback] Received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error("[Asana Callback] OAuth error from Asana:", error);
    return NextResponse.redirect(new URL(`/auth/asana/error?error=${error}`, request.url));
  }

  if (!code || !state) {
    console.error("[Asana Callback] Missing code or state");
    return NextResponse.redirect(new URL("/auth/asana/error?error=missing_params", request.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("asana_oauth_state")?.value;
  const codeVerifier = cookieStore.get("asana_code_verifier")?.value;
  const userId = cookieStore.get("asana_user_id")?.value;

  console.log("[Asana Callback] Cookie state:", {
    hasStoredState: !!storedState,
    hasCodeVerifier: !!codeVerifier,
    hasUserId: !!userId,
    stateMatch: state === storedState,
    allCookies: cookieStore.getAll().map(c => c.name),
  });

  if (state !== storedState) {
    console.error("[Asana Callback] State mismatch:", {
      received: state,
      stored: storedState,
    });
    return NextResponse.redirect(new URL("/auth/asana/error?error=invalid_state", request.url));
  }

  if (!codeVerifier || !userId) {
    console.error("[Asana Callback] Missing session data:", {
      hasCodeVerifier: !!codeVerifier,
      hasUserId: !!userId,
    });
    return NextResponse.redirect(new URL("/auth/asana/error?error=missing_session", request.url));
  }

  try {
    console.log("[Asana Callback] Exchanging code for tokens...");
    console.log("[Asana Callback] Using Client ID:", process.env.ASANA_CLIENT_ID?.slice(0, 8) + "...");

    const tokens = await exchangeCodeForTokens("asana", code, codeVerifier);

    console.log("[Asana Callback] Token exchange successful, saving tokens for user:", userId);

    await saveTokens(userId, "asana", tokens);

    // Clean up cookies
    cookieStore.delete("asana_code_verifier");
    cookieStore.delete("asana_oauth_state");
    cookieStore.delete("asana_user_id");

    console.log("[Asana Callback] Success! Redirecting to success page");
    return NextResponse.redirect(new URL("/auth/asana/success", request.url));
  } catch (err) {
    console.error("[Asana Callback] Token exchange failed:", err);
    console.error("[Asana Callback] Error details:", {
      message: err instanceof Error ? err.message : "Unknown",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.redirect(new URL(`/auth/asana/error?error=${toErrorCode(err)}`, request.url));
  }
}
