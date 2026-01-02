// lib/auth/platform-oauth.ts
/**
 * Platform OAuth Configuration and Utilities
 * Handles OAuth flows for external platforms (Zoom, Asana, etc.)
 */

import crypto from "crypto";
import { db } from "@/lib/db/client";
import { platformConnections, oauthStates, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

// ============================================
// TYPES
// ============================================

export type Platform = "zoom" | "teams" | "meet" | "asana" | "jira" | "notion" | "slack" | "gmail" | "outlook";
export type PlatformCategory = "meetings" | "tasks" | "email" | "communication";

export interface PlatformConfig {
  name: string;
  category: PlatformCategory;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  pkceRequired: boolean;
}

// ============================================
// PLATFORM CONFIGURATIONS
// ============================================

export function getPlatformConfig(platform: Platform): PlatformConfig {
  switch (platform) {
    case "zoom":
      return {
        name: "Zoom",
        category: "meetings",
        authUrl: "https://zoom.us/oauth/authorize",
        tokenUrl: "https://zoom.us/oauth/token",
        userInfoUrl: "https://api.zoom.us/v2/users/me",
        clientId: process.env.ZOOM_CLIENT_ID!,
        clientSecret: process.env.ZOOM_CLIENT_SECRET!,
        scopes: [
          "meeting:read:meeting",
          "cloud_recording:read:list_user_recordings",
          "cloud_recording:read:recording",
          "user:read:user",
        ],
        pkceRequired: true,
      };
    
    case "asana":
      return {
        name: "Asana",
        category: "tasks",
        authUrl: "https://app.asana.com/-/oauth_authorize",
        tokenUrl: "https://app.asana.com/-/oauth_token",
        userInfoUrl: "https://app.asana.com/api/1.0/users/me",
        clientId: process.env.ASANA_CLIENT_ID!,
        clientSecret: process.env.ASANA_CLIENT_SECRET!,
        scopes: ["default"],
        pkceRequired: false, // Asana doesn't support PKCE
      };
    
    case "teams":
      return {
        name: "Microsoft Teams",
        category: "meetings",
        authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userInfoUrl: "https://graph.microsoft.com/v1.0/me",
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        scopes: [
          "openid",
          "profile",
          "email",
          "User.Read",
          "OnlineMeetings.Read",
          "Calendars.Read",
        ],
        pkceRequired: true,
      };
    
    // Add more platforms as needed
    default:
      throw new Error(`Platform not configured: ${platform}`);
  }
}

// ============================================
// OAUTH URL BUILDERS
// ============================================

/**
 * Generate authorization URL for a platform
 */
export async function buildPlatformAuthUrl(
  platform: Platform,
  userId: string,
  redirectAfter?: string
): Promise<string> {
  const config = getPlatformConfig(platform);
  const redirectUri = `${BASE_URL}/api/auth/${platform}/callback`;
  
  // Generate state and PKCE
  const state = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  
  // Store state in database
  await db.insert(oauthStates).values({
    state,
    platform: platform as "zoom" | "teams" | "meet" | "webex" | "asana" | "jira" | "notion" | "linear" | "trello" | "monday" | "slack" | "gmail" | "outlook",
    userId,
    codeVerifier,
    redirectAfter,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });
  
  // Build URL
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  
  // Scopes
  if (platform === "zoom") {
    // Zoom uses space-separated scopes
    url.searchParams.set("scope", config.scopes.join(" "));
  } else if (platform === "asana") {
    // Asana doesn't use scope parameter
  } else {
    url.searchParams.set("scope", config.scopes.join(" "));
  }
  
  // PKCE
  if (config.pkceRequired) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  
  return url.toString();
}

// ============================================
// TOKEN EXCHANGE
// ============================================

export interface PlatformTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangePlatformCode(
  platform: Platform,
  code: string,
  state: string
): Promise<{ tokens: PlatformTokens; userId: string; codeVerifier: string }> {
  // Retrieve and validate state
  const [storedState] = await db
    .select()
    .from(oauthStates)
    .where(
      and(
        eq(oauthStates.state, state),
        eq(oauthStates.platform, platform as "zoom" | "teams" | "meet" | "webex" | "asana" | "jira" | "notion" | "linear" | "trello" | "monday" | "slack" | "gmail" | "outlook")
      )
    )
    .limit(1);
  
  if (!storedState) {
    throw new Error("Invalid or expired state");
  }
  
  if (storedState.usedAt) {
    throw new Error("State already used");
  }
  
  if (new Date() > storedState.expiresAt) {
    throw new Error("State expired");
  }
  
  // Mark state as used
  await db
    .update(oauthStates)
    .set({ usedAt: new Date() })
    .where(eq(oauthStates.id, storedState.id));
  
  const config = getPlatformConfig(platform);
  const redirectUri = `${BASE_URL}/api/auth/${platform}/callback`;
  
  // Build token request
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  
  // Add PKCE verifier if required
  if (config.pkceRequired && storedState.codeVerifier) {
    body.set("code_verifier", storedState.codeVerifier);
  }
  
  // Different auth methods per platform
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  
  if (platform === "zoom") {
    // Zoom uses Basic auth
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  } else {
    // Others use client_id/client_secret in body
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }
  
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[Platform OAuth ${platform}] Token exchange failed:`, error);
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  
  const tokens = await response.json();
  
  return {
    tokens,
    userId: storedState.userId!,
    codeVerifier: storedState.codeVerifier,
  };
}

// ============================================
// USER INFO
// ============================================

export interface PlatformUserInfo {
  id: string;
  email: string;
  displayName?: string;
}

/**
 * Fetch user info from platform
 */
export async function fetchPlatformUserInfo(
  platform: Platform,
  accessToken: string
): Promise<PlatformUserInfo> {
  const config = getPlatformConfig(platform);
  
  if (!config.userInfoUrl) {
    return { id: "unknown", email: "unknown" };
  }
  
  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[Platform ${platform}] User info failed:`, error);
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Normalize response
  switch (platform) {
    case "zoom":
      return {
        id: data.id,
        email: data.email,
        displayName: `${data.first_name} ${data.last_name}`.trim(),
      };
    
    case "asana":
      return {
        id: data.data.gid,
        email: data.data.email,
        displayName: data.data.name,
      };
    
    case "teams":
      return {
        id: data.id,
        email: data.mail || data.userPrincipalName,
        displayName: data.displayName,
      };
    
    default:
      return {
        id: data.id || "unknown",
        email: data.email || "unknown",
        displayName: data.name || data.displayName,
      };
  }
}

// ============================================
// TOKEN STORAGE
// ============================================

/**
 * Store or update platform connection
 */
export async function storePlatformConnection(
  userId: string,
  platform: Platform,
  tokens: PlatformTokens,
  userInfo: PlatformUserInfo
): Promise<void> {
  const config = getPlatformConfig(platform);
  
  // Calculate expiry
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  
  // Upsert connection
  await db
    .insert(platformConnections)
    .values({
      userId,
      platform: platform as "zoom" | "teams" | "meet" | "webex" | "asana" | "jira" | "notion" | "linear" | "trello" | "monday" | "slack" | "gmail" | "outlook",
      platformCategory: config.category as "meetings" | "tasks" | "email" | "communication",
      platformUserId: userInfo.id,
      platformEmail: userInfo.email,
      platformDisplayName: userInfo.displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type || "Bearer",
      scope: tokens.scope,
      expiresAt,
      isDefault: true,
      isActive: true,
      connectedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [platformConnections.userId, platformConnections.platform],
      set: {
        platformUserId: userInfo.id,
        platformEmail: userInfo.email,
        platformDisplayName: userInfo.displayName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenType: tokens.token_type || "Bearer",
        scope: tokens.scope,
        expiresAt,
        isActive: true,
        updatedAt: new Date(),
      },
    });
  
  // Log the connection
  await db.insert(auditLog).values({
    userId,
    eventType: "platform.connected",
    eventCategory: "settings",
    resourceType: "platform_connection",
    description: `Connected ${config.name}`,
    metadata: {
      platform,
      platformEmail: userInfo.email,
    },
  });
  
  console.log(`[Platform OAuth] Stored ${platform} connection for user ${userId}`);
}

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * Refresh platform tokens
 */
export async function refreshPlatformTokens(
  connectionId: string
): Promise<PlatformTokens | null> {
  // Get connection
  const [connection] = await db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.id, connectionId))
    .limit(1);
  
  if (!connection || !connection.refreshToken) {
    return null;
  }
  
  const platform = connection.platform as Platform;
  const config = getPlatformConfig(platform);
  
  // Build refresh request
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });
  
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  
  if (platform === "zoom") {
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  } else {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }
  
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  
  if (!response.ok) {
    console.error(`[Platform OAuth ${platform}] Token refresh failed`);
    return null;
  }
  
  const tokens: PlatformTokens = await response.json();
  
  // Update stored tokens
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  
  await db
    .update(platformConnections)
    .set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || connection.refreshToken,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, connectionId));
  
  return tokens;
}

/**
 * Get valid access token, refreshing if needed
 */
export async function getValidAccessToken(
  userId: string,
  platform: Platform
): Promise<string | null> {
  const [connection] = await db
    .select()
    .from(platformConnections)
    .where(
      and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, platform as "zoom" | "teams" | "meet" | "webex" | "asana" | "jira" | "notion" | "linear" | "trello" | "monday" | "slack" | "gmail" | "outlook"),
        eq(platformConnections.isActive, true)
      )
    )
    .limit(1);
  
  if (!connection) {
    return null;
  }
  
  // Check if token is expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000;
  const isExpired = connection.expiresAt && 
    new Date(connection.expiresAt.getTime() - bufferMs) <= new Date();
  
  if (isExpired && connection.refreshToken) {
    const newTokens = await refreshPlatformTokens(connection.id);
    if (newTokens) {
      return newTokens.access_token;
    }
    return null;
  }
  
  return connection.accessToken;
}

