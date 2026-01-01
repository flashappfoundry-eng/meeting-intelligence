import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
} from "@/lib/auth/oauth";
import { deriveUserIdFromHeaders } from "@/lib/auth/user-id";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Try URL parameter first (for manual/testing), then derive from headers
  let userId = searchParams.get("userId");

  if (!userId) {
    // Derive from headers - same logic as MCP endpoint
    // This ensures ChatGPT OAuth uses the same user ID as MCP requests
    userId = deriveUserIdFromHeaders(request.headers);
    console.log("[Asana OAuth] Derived userId from headers:", userId);
  } else {
    console.log("[Asana OAuth] Using userId from URL parameter:", userId);
  }

  if (!userId || userId === "anonymous-user") {
    console.error("[Asana OAuth] Could not determine user ID");
    console.error(
      "[Asana OAuth] Headers:",
      Object.fromEntries(request.headers.entries()),
    );
    return NextResponse.json(
      {
        error:
          "Could not determine user identity. Please try again from ChatGPT.",
      },
      { status: 400 },
    );
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const cookieStore = await cookies();

  cookieStore.set("asana_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("asana_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  cookieStore.set("asana_user_id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authUrl = buildAuthUrl({
    platform: "asana",
    state,
    codeChallenge,
    userId,
  });

  console.log("[Asana OAuth] Redirecting to Asana with userId:", userId);

  return NextResponse.redirect(authUrl);
}

