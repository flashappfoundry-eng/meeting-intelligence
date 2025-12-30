import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { oauthStates, oauthTokens } from "@/lib/db/schema";
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

export async function getUserTokens(userId: string, platform: OAuthPlatform) {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, platform)))
    .limit(1);

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
  const expiresAt =
    typeof tokens.expires_in === "number" ? new Date(nowMs() + tokens.expires_in * 1000) : null;

  const scopeString =
    (typeof tokens.scope === "string" && tokens.scope.trim()) || (scopes?.length ? scopes.join(" ") : null);

  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

  await db
    .insert(oauthTokens)
    .values({
      userId,
      provider: platform,
      providerUserId: platformUserId ?? null,
      providerEmail: platformEmail ?? null,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenType: tokens.token_type ?? null,
      scope: scopeString,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        providerUserId: platformUserId ?? null,
        providerEmail: platformEmail ?? null,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenType: tokens.token_type ?? null,
        scope: scopeString,
        expiresAt,
        updatedAt: new Date(),
      },
    });
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

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${platform} token refresh failed (${res.status}): ${text || res.statusText}`);
  }

  const json = JSON.parse(text) as OAuthTokenResponse;
  if (!json.access_token) {
    throw new Error(`${platform} refresh response missing access_token`);
  }

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


