import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { oauthStates, platformConnections, users } from "@/lib/db/schema";
import { coerceUserIdToUuid } from "@/lib/auth/user-id";
import {
  decryptToken,
  encryptToken,
  oauthConfig,
  type OAuthPlatform,
  type OAuthTokenResponse,
} from "@/lib/auth/oauth";

export type StoredUserTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

function nowMs() {
  return Date.now();
}

function isExpiredOrNearExpiry(expiresAt: Date | null, skewMs: number) {
  if (!expiresAt) return false;
  return expiresAt.getTime() - nowMs() <= skewMs;
}

/**
 * Map OAuthPlatform to platformCategory for the new schema
 */
function getPlatformCategory(platform: OAuthPlatform): "meetings" | "tasks" {
  switch (platform) {
    case "zoom":
      return "meetings";
    case "asana":
      return "tasks";
    default:
      return "meetings";
  }
}

export async function getUserTokens(userId: string, platform: OAuthPlatform) {
  const userUuid = coerceUserIdToUuid(userId);

  // Local/dev safety: if Postgres isn't configured, behave as if no tokens exist.
  // This keeps MCP tool errors user-friendly ("connect your account") instead of leaking SQL.
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    return null;
  }

  let rows: Array<typeof platformConnections.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(platformConnections)
      .where(and(eq(platformConnections.userId, userUuid), eq(platformConnections.platform, platform)))
      .limit(1);
  } catch (e) {
    // If the DB is unreachable/misconfigured in local dev, behave as if no tokens exist.
    // This avoids leaking SQL errors through MCP and keeps UX aligned with "connect account first".
    void e;
    return null;
  }

  const row = rows[0];
  if (!row) return null;

  return {
    accessToken: decryptToken(row.accessToken),
    refreshToken: row.refreshToken ? decryptToken(row.refreshToken) : null,
    expiresAt: row.expiresAt ?? null,
  } satisfies StoredUserTokens;
}

export async function saveUserTokens(
  userId: string,
  platform: OAuthPlatform,
  tokens: Pick<OAuthTokenResponse, "access_token" | "refresh_token" | "expires_in" | "token_type"> & {
    scope?: string;
  },
  platformUserId?: string,
  platformEmail?: string,
  scopes?: string[],
) {
  const userUuid = coerceUserIdToUuid(userId);

  const expiresAt =
    typeof tokens.expires_in === "number" ? new Date(nowMs() + tokens.expires_in * 1000) : null;

  const scopeString =
    (typeof tokens.scope === "string" && tokens.scope.trim()) || (scopes?.length ? scopes.join(" ") : null);

  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

  console.log("[saveUserTokens] Attempting upsert:", {
    userUuid,
    platform,
    hasAccessToken: !!encryptedAccess,
    hasRefreshToken: !!encryptedRefresh,
  });

  console.log("[saveUserTokens] Query parameters:", {
    userUuid,
    platform,
    accessTokenLength: encryptedAccess?.length,
    refreshTokenLength: encryptedRefresh?.length,
    accessTokenPreview: encryptedAccess?.substring(0, 50) + "...",
    expiresAt: expiresAt?.toISOString(),
    hasPlatformUserId: !!platformUserId,
    hasPlatformEmail: !!platformEmail,
  });

  try {
    // CRITICAL FIX: Create user record if it doesn't exist
    // This satisfies the foreign key constraint on platform_connections.user_id
    // Use a unique placeholder email based on userUuid to avoid email unique constraint conflicts
    const placeholderEmail = platformEmail || `${userUuid}@oauth.placeholder`;
    console.log("[saveUserTokens] Ensuring user exists:", { userUuid, placeholderEmail });

    await db
      .insert(users)
      .values({
        id: userUuid,
        email: placeholderEmail,
        name: platformUserId || userId,
      })
      .onConflictDoNothing(); // Don't fail if user already exists

    console.log("[saveUserTokens] User ensured, now saving tokens");

    await db
      .insert(platformConnections)
      .values({
        userId: userUuid,
        platform: platform,
        platformCategory: getPlatformCategory(platform),
        platformUserId: platformUserId ?? null,
        platformEmail: platformEmail ?? null,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenType: tokens.token_type ?? "Bearer",
        scope: scopeString,
        expiresAt,
        isDefault: true,
        isActive: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [platformConnections.userId, platformConnections.platform],
        set: {
          platformUserId: platformUserId ?? null,
          platformEmail: platformEmail ?? null,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenType: tokens.token_type ?? "Bearer",
          scope: scopeString,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    console.log("[saveUserTokens] Success!");
  } catch (error: unknown) {
    // Log the full error object with all properties
    console.error("[saveUserTokens] Database error - Full object:", error);

    // Log specific error properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    console.error("[saveUserTokens] Database error - Details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      // PostgreSQL error properties (may be on error or error.cause)
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      column: err?.column,
      table: err?.table,
      // Drizzle may wrap the error
      cause: err?.cause,
      causeCode: err?.cause?.code,
      causeDetail: err?.cause?.detail,
      causeMessage: err?.cause?.message,
      // Stack trace
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Also try to stringify the entire error
    try {
      console.error(
        "[saveUserTokens] Database error - JSON:",
        JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2),
      );
    } catch {
      console.error("[saveUserTokens] Could not stringify error");
    }

    throw error;
  }
}

// Back-compat helper for route handlers that use the simpler name.
export async function saveTokens(
  userId: string,
  platform: OAuthPlatform,
  tokens: OAuthTokenResponse,
) {
  return saveUserTokens(
    userId,
    platform,
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
}

export async function refreshTokenIfNeeded(
  userId: string,
  platform: OAuthPlatform,
  tokens: StoredUserTokens,
) {
  // Refresh if expired or within 2 minutes of expiry.
  const skewMs = 2 * 60 * 1000;
  if (!isExpiredOrNearExpiry(tokens.expiresAt, skewMs)) {
    return tokens;
  }

  console.log(`[refreshTokenIfNeeded] Token expired or near expiry for ${platform}, refreshing...`);
  return forceRefreshToken(userId, platform, tokens);
}

/**
 * Force refresh the token regardless of expiry time.
 * Use this when you get a 401 from the API.
 */
export async function forceRefreshToken(
  userId: string,
  platform: OAuthPlatform,
  tokens?: StoredUserTokens | null,
): Promise<StoredUserTokens> {
  console.log(`[forceRefreshToken] Force refreshing ${platform} token for user: ${userId}`);
  
  // If tokens not provided, fetch them
  if (!tokens) {
    tokens = await getUserTokens(userId, platform);
  }
  
  if (!tokens) {
    throw new Error(`No ${platform} tokens found for user ${userId}`);
  }

  if (!tokens.refreshToken) {
    throw new Error(`${platform} access token expired and no refresh token is available.`);
  }

  const cfg = oauthConfig[platform];
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", tokens.refreshToken);

  let headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (platform === "zoom") {
    // Zoom expects HTTP Basic auth.
    const clientId = cfg.clientId || process.env.ZOOM_CLIENT_ID || "";
    const clientSecret = cfg.clientSecret || process.env.ZOOM_CLIENT_SECRET || "";
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers = { ...headers, Authorization: `Basic ${basic}` };
  } else {
    const clientId = cfg.clientId || process.env.ASANA_CLIENT_ID || "";
    const clientSecret = cfg.clientSecret || process.env.ASANA_CLIENT_SECRET || "";
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  console.log(`[forceRefreshToken] Calling ${cfg.tokenUrl}`);
  
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await res.text();
  console.log(`[forceRefreshToken] Response status: ${res.status}`);
  
  if (!res.ok) {
    console.error(`[forceRefreshToken] Refresh failed: ${text}`);
    throw new Error(`${platform} token refresh failed (${res.status}): ${text || res.statusText}`);
  }

  const json = JSON.parse(text) as OAuthTokenResponse;
  if (!json.access_token) {
    throw new Error(`${platform} refresh response missing access_token`);
  }

  console.log(`[forceRefreshToken] Got new access token, expires in ${json.expires_in}s`);

  const refreshed: StoredUserTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt:
      typeof json.expires_in === "number" ? new Date(nowMs() + json.expires_in * 1000) : tokens.expiresAt,
  };

  await saveUserTokens(
    userId,
    platform,
    {
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? undefined,
      expires_in: json.expires_in,
      token_type: json.token_type,
      scope: json.scope,
    },
    undefined,
    undefined,
    undefined,
  );

  console.log(`[forceRefreshToken] ✓ Tokens saved to database`);

  return refreshed;
}

/**
 * Helper: clear unconsumed/expired oauth_states (optional utility).
 * Not required by the docs, but useful during development.
 */
export async function deleteExpiredOAuthStates(now = new Date()) {
  void now;
  // Intentionally left as a no-op for now (Drizzle delete with < requires extra ops).
  // Kept exported so we can add housekeeping later without API churn.
  void oauthStates;
}
