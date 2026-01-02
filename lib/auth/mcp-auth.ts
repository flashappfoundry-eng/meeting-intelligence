// lib/auth/mcp-auth.ts
/**
 * MCP Authentication Utilities
 * Handles Bearer token verification for MCP requests from ChatGPT
 */

import { db } from "@/lib/db/client";
import { users, oauthAccessTokens, platformConnections } from "@/lib/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { extractBearerToken, verifyAccessToken, type VerifiedAccessToken } from "./jwt";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  scopes: string[];
  clientId: string;
}

export interface MCPAuthResult {
  authenticated: boolean;
  user?: AuthenticatedUser;
  error?: string;
  errorCode?: "missing_token" | "invalid_token" | "expired_token" | "revoked_token" | "user_not_found";
}

/**
 * Authenticate an MCP request using the Bearer token
 */
export async function authenticateMCPRequest(request: Request): Promise<MCPAuthResult> {
  const authHeader = request.headers.get("authorization");
  
  // Log for debugging
  console.log("[MCP Auth] Authorization header present:", !!authHeader);
  
  // Extract Bearer token
  const token = extractBearerToken(authHeader);
  
  if (!token) {
    console.log("[MCP Auth] No Bearer token found");
    return {
      authenticated: false,
      error: "Missing or invalid Authorization header. Expected: Bearer <token>",
      errorCode: "missing_token",
    };
  }
  
  // Verify the token
  let decoded: VerifiedAccessToken;
  try {
    decoded = await verifyAccessToken(token);
    console.log("[MCP Auth] Token verified for user:", decoded.sub);
  } catch (error) {
    console.error("[MCP Auth] Token verification failed:", error);
    
    const message = error instanceof Error ? error.message : "Token verification failed";
    const isExpired = message.includes("expired");
    
    return {
      authenticated: false,
      error: message,
      errorCode: isExpired ? "expired_token" : "invalid_token",
    };
  }
  
  // Check if token is revoked
  const [storedToken] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.jti, decoded.jti),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  
  if (!storedToken) {
    console.log("[MCP Auth] Token not found or revoked:", decoded.jti);
    return {
      authenticated: false,
      error: "Token has been revoked or is invalid",
      errorCode: "revoked_token",
    };
  }
  
  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, decoded.sub))
    .limit(1);
  
  if (!user) {
    console.log("[MCP Auth] User not found:", decoded.sub);
    return {
      authenticated: false,
      error: "User not found",
      errorCode: "user_not_found",
    };
  }
  
  console.log("[MCP Auth] Authenticated user:", user.email);
  
  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      scopes: decoded.scope.split(" "),
      clientId: decoded.client_id,
    },
  };
}

/**
 * Check if user has required scope
 */
export function hasScope(user: AuthenticatedUser, requiredScope: string): boolean {
  return user.scopes.includes(requiredScope);
}

/**
 * Check if user has any of the required scopes
 */
export function hasAnyScope(user: AuthenticatedUser, requiredScopes: string[]): boolean {
  return requiredScopes.some(scope => user.scopes.includes(scope));
}

/**
 * Check if user has all required scopes
 */
export function hasAllScopes(user: AuthenticatedUser, requiredScopes: string[]): boolean {
  return requiredScopes.every(scope => user.scopes.includes(scope));
}

/**
 * Get user's platform connections
 */
export async function getUserPlatformConnections(userId: string) {
  const connections = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.isActive, true)
      )
    );
  
  return connections;
}

/**
 * Get a specific platform connection for a user
 */
export async function getUserPlatformConnection(userId: string, platform: string) {
  const [connection] = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eq(platformConnections.platform, platform as any),
        eq(platformConnections.isActive, true)
      )
    )
    .limit(1);
  
  return connection;
}

/**
 * Build OAuth required response for MCP
 * This tells ChatGPT that authentication is needed
 */
export function buildAuthRequiredResponse(errorCode: string, errorMessage: string) {
  return {
    jsonrpc: "2.0",
    error: {
      code: -32001, // Custom error code for auth required
      message: errorMessage,
      data: {
        type: "authentication_required",
        errorCode,
        authUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`,
      },
    },
  };
}

