// app/oauth/authorize/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { oauthClients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// Valid scopes that can be requested
const VALID_SCOPES = new Set([
  "openid",
  "profile", 
  "email",
  "offline_access",
  "meetings:read",
  "meetings:summary",
  "tasks:write",
  "email:draft",
]);

/**
 * OAuth 2.1 Authorization Endpoint
 * 
 * Flow:
 * 1. ChatGPT redirects user here with client_id, redirect_uri, etc.
 * 2. We validate the request and store parameters in a cookie
 * 3. Redirect to login page (or consent if already logged in)
 * 4. After auth, user is redirected back to ChatGPT with an auth code
 */
export async function GET(request: Request) {
  // ============================================
  // RAW DEBUG - Log everything before any processing
  // ============================================
  const rawUrl = request.url;
  console.log("[OAuth Authorize] === RAW REQUEST DEBUG ===");
  console.log("[OAuth Authorize] Full URL:", rawUrl);
  console.log("[OAuth Authorize] URL search:", new URL(rawUrl).search);
  
  const url = new URL(request.url);
  const params = url.searchParams;
  
  console.log("[OAuth Authorize] All params:", Object.fromEntries(params.entries()));
  console.log("[OAuth Authorize] response_type raw:", params.get("response_type"));
  console.log("[OAuth Authorize] response_type has value:", params.has("response_type"));
  
  // ============================================
  // EXTRACT PARAMETERS
  // ============================================
  
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const scope = params.get("scope") || "openid";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") || "S256";
  const nonce = params.get("nonce"); // OpenID Connect
  
  // Add debug logging with standard OAuth parameter names
  console.log("[OAuth Authorize] Received params:", {
    client_id: clientId,
    redirect_uri: redirectUri ? redirectUri.substring(0, 50) + "..." : null,
    response_type: responseType,
    scope,
    state: state ? "present" : "missing",
    code_challenge: codeChallenge ? "present" : "missing",
    code_challenge_method: codeChallengeMethod,
  });
  
  // ============================================
  // VALIDATE REQUIRED PARAMETERS
  // ============================================
  
  // Validate response_type FIRST with clear logging
  if (responseType !== "code") {
    console.error("[OAuth Authorize] Invalid response_type:", responseType);
    return errorResponse(
      redirectUri,
      state,
      "unsupported_response_type",
      `Only response_type=code is supported. Received: ${responseType}`
    );
  }
  
  // Check required parameters
  if (!clientId) {
    return NextResponse.json({
      error: "invalid_request",
      error_description: "Missing required parameter: client_id",
    }, { status: 400 });
  }
  
  if (!redirectUri) {
    return NextResponse.json({
      error: "invalid_request", 
      error_description: "Missing required parameter: redirect_uri",
    }, { status: 400 });
  }
  
  // PKCE is required for OAuth 2.1
  if (!codeChallenge) {
    return errorResponse(
      redirectUri,
      state,
      "invalid_request",
      "PKCE code_challenge is required"
    );
  }
  
  if (codeChallengeMethod !== "S256") {
    return errorResponse(
      redirectUri,
      state,
      "invalid_request",
      "Only code_challenge_method=S256 is supported"
    );
  }
  
  // ============================================
  // VALIDATE CLIENT
  // ============================================
  
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  
  // For ChatGPT, we auto-register clients on first use
  // This is a common pattern for MCP servers
  let validClient = client;
  
  if (!client) {
    // Auto-register ChatGPT as a client
    if (redirectUri.includes("chatgpt.com") || redirectUri.includes("openai.com")) {
      console.log("[OAuth Authorize] Auto-registering ChatGPT client");
      
      const [newClient] = await db
        .insert(oauthClients)
        .values({
          clientId,
          clientName: "ChatGPT",
          clientDescription: "OpenAI ChatGPT MCP Client",
          redirectUris: [redirectUri],
          clientType: "public",
          grantTypes: ["authorization_code", "refresh_token"],
          responseTypes: ["code"],
          allowedScopes: "openid profile email meetings:read meetings:summary tasks:write",
          isActive: true,
        })
        .returning();
      
      validClient = newClient;
    } else {
      return NextResponse.json({
        error: "invalid_client",
        error_description: "Unknown client_id",
      }, { status: 400 });
    }
  }
  
  if (!validClient?.isActive) {
    return NextResponse.json({
      error: "invalid_client",
      error_description: "Client is not active",
    }, { status: 400 });
  }
  
  // ============================================
  // VALIDATE REDIRECT URI
  // ============================================
  
  const allowedUris: string[] = validClient.redirectUris as string[];
  
  // For ChatGPT, be flexible with redirect URIs (they may vary)
  const isValidRedirect = allowedUris.some(uri => 
    redirectUri === uri || 
    redirectUri.startsWith(uri) ||
    (uri.includes("chatgpt.com") && redirectUri.includes("chatgpt.com")) ||
    (uri.includes("openai.com") && redirectUri.includes("openai.com"))
  );
  
  if (!isValidRedirect && !redirectUri.includes("chatgpt.com") && !redirectUri.includes("openai.com")) {
    return NextResponse.json({
      error: "invalid_request",
      error_description: "Invalid redirect_uri",
    }, { status: 400 });
  }
  
  // Update client with new redirect URI if needed
  if (!allowedUris.includes(redirectUri)) {
    await db
      .update(oauthClients)
      .set({ 
        redirectUris: [...allowedUris, redirectUri],
        updatedAt: new Date(),
      })
      .where(eq(oauthClients.clientId, clientId));
  }
  
  // ============================================
  // VALIDATE SCOPES
  // ============================================
  
  const requestedScopes = scope.split(" ").filter(s => s.length > 0);
  const invalidScopes = requestedScopes.filter(s => !VALID_SCOPES.has(s));
  
  if (invalidScopes.length > 0) {
    return errorResponse(
      redirectUri,
      state,
      "invalid_scope",
      `Invalid scopes: ${invalidScopes.join(", ")}`
    );
  }
  
  // ============================================
  // STORE AUTH REQUEST & REDIRECT TO LOGIN
  // ============================================
  
  const authRequestId = crypto.randomUUID();
  const authRequest = {
    id: authRequestId,
    clientId,
    clientName: validClient.clientName,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod,
    state,
    nonce,
    createdAt: Date.now(),
  };
  
  const cookieStore = await cookies();
  
  // Store auth request in cookie (encrypted in production)
  cookieStore.set("oauth_auth_request", JSON.stringify(authRequest), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  
  // Redirect to login page
  const loginUrl = new URL("/oauth/login", BASE_URL);
  loginUrl.searchParams.set("auth_request_id", authRequestId);
  
  console.log("[OAuth Authorize] Redirecting to login:", loginUrl.toString());
  
  return NextResponse.redirect(loginUrl);
}

/**
 * Build error redirect response
 */
function errorResponse(
  redirectUri: string | null,
  state: string | null,
  error: string,
  errorDescription: string
): NextResponse {
  // If we can't redirect, return JSON error
  if (!redirectUri) {
    return NextResponse.json({
      error,
      error_description: errorDescription,
    }, { status: 400 });
  }
  
  // Redirect with error
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", errorDescription);
  if (state) {
    url.searchParams.set("state", state);
  }
  
  return NextResponse.redirect(url);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

