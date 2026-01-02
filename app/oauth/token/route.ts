// app/oauth/token/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { 
  oauthAuthorizationCodes, 
  oauthAccessTokens, 
  oauthRefreshTokens,
  users 
} from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import {
  generateAccessToken,
  generateRefreshToken,
  generateIdToken,
  verifyRefreshToken,
  verifyCodeChallenge,
} from "@/lib/auth/jwt";

/**
 * OAuth 2.1 Token Endpoint
 * 
 * Handles:
 * - authorization_code: Exchange auth code for tokens
 * - refresh_token: Get new access token using refresh token
 */
export async function POST(request: Request) {
  // Parse request body
  const contentType = request.headers.get("content-type") || "";
  
  let params: URLSearchParams;
  
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    params = new URLSearchParams(body);
  } else if (contentType.includes("application/json")) {
    const body = await request.json();
    params = new URLSearchParams(body);
  } else {
    return tokenError("invalid_request", "Content-Type must be application/x-www-form-urlencoded or application/json");
  }
  
  const grantType = params.get("grant_type");
  
  console.log("[OAuth Token] Request received:", { grantType });
  
  switch (grantType) {
    case "authorization_code":
      return handleAuthorizationCode(params);
    case "refresh_token":
      return handleRefreshToken(params);
    default:
      return tokenError("unsupported_grant_type", "Supported: authorization_code, refresh_token");
  }
}

/**
 * Handle authorization_code grant
 */
async function handleAuthorizationCode(params: URLSearchParams) {
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");
  
  // Validate required parameters
  if (!code || !redirectUri || !clientId) {
    return tokenError("invalid_request", "Missing required parameters: code, redirect_uri, client_id");
  }
  
  if (!codeVerifier) {
    return tokenError("invalid_request", "Missing required parameter: code_verifier (PKCE)");
  }
  
  // Find the authorization code
  const [authCode] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.code, code),
        eq(oauthAuthorizationCodes.clientId, clientId),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date())
      )
    )
    .limit(1);
  
  if (!authCode) {
    console.log("[OAuth Token] Invalid or expired authorization code");
    return tokenError("invalid_grant", "Invalid or expired authorization code");
  }
  
  // Validate redirect URI
  if (authCode.redirectUri !== redirectUri) {
    console.log("[OAuth Token] Redirect URI mismatch");
    return tokenError("invalid_grant", "Redirect URI mismatch");
  }
  
  // Validate PKCE code verifier
  if (!verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod as "S256" | "plain")) {
    console.log("[OAuth Token] Invalid code_verifier");
    return tokenError("invalid_grant", "Invalid code_verifier");
  }
  
  // Mark code as used (one-time use)
  await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.id, authCode.id));
  
  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, authCode.userId))
    .limit(1);
  
  if (!user) {
    console.error("[OAuth Token] User not found:", authCode.userId);
    return tokenError("server_error", "User not found");
  }
  
  // Generate tokens
  const accessTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name || undefined,
    scope: authCode.scope,
    client_id: clientId,
  };
  
  const { token: accessToken, jti: accessJti, expiresAt: accessExpiresAt } = 
    await generateAccessToken(accessTokenPayload);
  
  const { token: refreshToken, jti: refreshJti, expiresAt: refreshExpiresAt } = 
    await generateRefreshToken({
      sub: user.id,
      client_id: clientId,
      scope: authCode.scope,
    });
  
  // Store token metadata for revocation
  await db.insert(oauthAccessTokens).values({
    jti: accessJti,
    clientId,
    userId: user.id,
    scope: authCode.scope,
    expiresAt: accessExpiresAt,
  });
  
  await db.insert(oauthRefreshTokens).values({
    jti: refreshJti,
    clientId,
    userId: user.id,
    scope: authCode.scope,
    expiresAt: refreshExpiresAt,
  });
  
  console.log("[OAuth Token] Tokens issued for user:", user.id);
  
  // Build response
  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600, // 1 hour
    refresh_token: refreshToken,
    scope: authCode.scope,
  };
  
  // Include ID token if openid scope was requested
  if (authCode.scope.includes("openid")) {
    const idToken = await generateIdToken(
      {
        sub: user.id,
        email: user.email,
        email_verified: user.emailVerified || false,
        name: user.name || undefined,
        picture: user.avatarUrl || undefined,
      },
      clientId,
      authCode.nonce || undefined
    );
    response.id_token = idToken;
  }
  
  return NextResponse.json(response, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}

/**
 * Handle refresh_token grant
 */
async function handleRefreshToken(params: URLSearchParams) {
  const refreshTokenValue = params.get("refresh_token");
  const clientId = params.get("client_id");
  const scope = params.get("scope"); // Optional: request subset of original scopes
  
  if (!refreshTokenValue) {
    return tokenError("invalid_request", "Missing required parameter: refresh_token");
  }
  
  // Verify the refresh token
  let decoded;
  try {
    decoded = await verifyRefreshToken(refreshTokenValue);
  } catch (error) {
    console.error("[OAuth Token] Invalid refresh token:", error);
    return tokenError("invalid_grant", "Invalid or expired refresh token");
  }
  
  // Verify client_id if provided
  if (clientId && decoded.client_id !== clientId) {
    return tokenError("invalid_grant", "Client ID mismatch");
  }
  
  // Check if token is revoked
  const [storedToken] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(
      and(
        eq(oauthRefreshTokens.jti, decoded.jti),
        isNull(oauthRefreshTokens.revokedAt)
      )
    )
    .limit(1);
  
  if (!storedToken) {
    return tokenError("invalid_grant", "Refresh token has been revoked");
  }
  
  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, decoded.sub))
    .limit(1);
  
  if (!user) {
    return tokenError("invalid_grant", "User not found");
  }
  
  // Determine scopes for new token
  const originalScopes = decoded.scope.split(" ");
  let newScopes = originalScopes;
  
  if (scope) {
    const requestedScopes = scope.split(" ");
    // Can only request subset of original scopes
    newScopes = requestedScopes.filter(s => originalScopes.includes(s));
  }
  
  // Generate new access token
  const { token: accessToken, jti: accessJti, expiresAt: accessExpiresAt } = 
    await generateAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name || undefined,
      scope: newScopes.join(" "),
      client_id: decoded.client_id,
    });
  
  // Store new access token
  await db.insert(oauthAccessTokens).values({
    jti: accessJti,
    clientId: decoded.client_id,
    userId: user.id,
    scope: newScopes.join(" "),
    expiresAt: accessExpiresAt,
  });
  
  // Update refresh token last used
  await db
    .update(oauthRefreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthRefreshTokens.jti, decoded.jti));
  
  console.log("[OAuth Token] Access token refreshed for user:", user.id);
  
  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: newScopes.join(" "),
  }, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}

/**
 * Build token error response
 */
function tokenError(error: string, description: string, status: number = 400) {
  return NextResponse.json({
    error,
    error_description: description,
  }, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

