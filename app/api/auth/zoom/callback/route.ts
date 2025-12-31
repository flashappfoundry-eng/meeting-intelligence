import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens } from "@/lib/auth/oauth";
import { saveTokens } from "@/lib/auth/tokens";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  console.log("[Zoom Callback] Received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error("[Zoom Callback] OAuth error from Zoom:", error);
    return NextResponse.redirect(new URL(`/auth/error?error=${error}`, request.url));
  }

  if (!code || !state) {
    console.error("[Zoom Callback] Missing code or state");
    return NextResponse.redirect(new URL("/auth/error?error=missing_params", request.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("zoom_oauth_state")?.value;
  const codeVerifier = cookieStore.get("zoom_code_verifier")?.value;
  const userId = cookieStore.get("zoom_user_id")?.value;

  console.log("[Zoom Callback] Cookie state:", {
    hasStoredState: !!storedState,
    hasCodeVerifier: !!codeVerifier,
    hasUserId: !!userId,
    stateMatch: state === storedState,
  });

  if (state !== storedState) {
    console.error("[Zoom Callback] State mismatch:", {
      received: state,
      stored: storedState,
    });
    return NextResponse.redirect(new URL("/auth/error?error=invalid_state", request.url));
  }

  if (!codeVerifier || !userId) {
    console.error("[Zoom Callback] Missing session data");
    return NextResponse.redirect(new URL("/auth/error?error=missing_session", request.url));
  }

  try {
    console.log("[Zoom Callback] Exchanging code for tokens...");
    console.log("[Zoom Callback] Using Client ID:", process.env.ZOOM_CLIENT_ID?.slice(0, 8) + "...");

    const tokens = await exchangeCodeForTokens("zoom", code, codeVerifier);

    console.log("[Zoom Callback] Token exchange successful, saving tokens for user:", userId);

    await saveTokens(userId, "zoom", tokens);

    // Clean up cookies
    cookieStore.delete("zoom_code_verifier");
    cookieStore.delete("zoom_oauth_state");
    cookieStore.delete("zoom_user_id");

    console.log("[Zoom Callback] Success! Redirecting to success page");
    return NextResponse.redirect(new URL("/auth/success?platform=zoom", request.url));
  } catch (err) {
    console.error("[Zoom Callback] Token exchange failed:", err);
    console.error("[Zoom Callback] Error details:", {
      message: err instanceof Error ? err.message : "Unknown",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.redirect(new URL("/auth/error?error=token_exchange_failed", request.url));
  }
}


