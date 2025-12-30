import crypto from "node:crypto";

export type OAuthPlatform = "zoom" | "asana";

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

function base64UrlEncode(buf: Buffer) {
  return buf.toString("base64url");
}

function base64UrlDecode(s: string) {
  return Buffer.from(s, "base64url");
}

function sha256Base64Url(input: string) {
  return base64UrlEncode(crypto.createHash("sha256").update(input).digest());
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return v;
}

function getTokenEncryptionKey() {
  const hex = requireEnv("TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars) for AES-256-GCM.",
    );
  }
  return key;
}

/**
 * PKCE helpers
 */
export function generateCodeVerifier() {
  // PKCE code_verifier must be 43-128 chars, using unreserved characters.
  // A 32-byte random buffer base64url-encodes to 43 chars.
  return base64UrlEncode(crypto.randomBytes(32));
}

export function generateCodeChallenge(verifier: string) {
  return sha256Base64Url(verifier);
}

export function generateState() {
  return base64UrlEncode(crypto.randomBytes(16));
}

/**
 * AES-256-GCM encryption using TOKEN_ENCRYPTION_KEY (hex).
 * Returns/accepts: "iv:authTag:encrypted" (base64url parts).
 */
export function encryptToken(token: string) {
  const key = getTokenEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${base64UrlEncode(iv)}:${base64UrlEncode(authTag)}:${base64UrlEncode(
    encrypted,
  )}`;
}

export function decryptToken(encrypted: string) {
  const key = getTokenEncryptionKey();
  const [ivB64, tagB64, dataB64] = encrypted.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted token format. Expected iv:authTag:encrypted");
  }
  const iv = base64UrlDecode(ivB64);
  const authTag = base64UrlDecode(tagB64);
  const data = base64UrlDecode(dataB64);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export const oauthConfig: Record<OAuthPlatform, OAuthConfig> = {
  zoom: {
    authUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    clientId: process.env.ZOOM_CLIENT_ID ?? "",
    clientSecret: process.env.ZOOM_CLIENT_SECRET ?? "",
    redirectUri: process.env.ZOOM_REDIRECT_URI ?? "",
    // Minimal scopes for meeting listing + reading recording metadata.
    // (Exact app scopes are configured in the Zoom Marketplace app settings.)
    scopes: ["meeting:read", "recording:read"],
  },
  asana: {
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    clientId: process.env.ASANA_CLIENT_ID ?? "",
    clientSecret: process.env.ASANA_CLIENT_SECRET ?? "",
    redirectUri: process.env.ASANA_REDIRECT_URI ?? "",
    scopes: [
      "tasks:read",
      "tasks:write",
      "users:read",
      "projects:read",
      "workspaces:read",
    ],
  },
};

function getValidatedConfig(platform: OAuthPlatform): OAuthConfig {
  const cfg = oauthConfig[platform];
  // Validate lazily at call-sites so `next build` doesn't require env vars.
  if (!cfg.clientId) requireEnv(platform === "zoom" ? "ZOOM_CLIENT_ID" : "ASANA_CLIENT_ID");
  if (!cfg.clientSecret)
    requireEnv(platform === "zoom" ? "ZOOM_CLIENT_SECRET" : "ASANA_CLIENT_SECRET");
  if (!cfg.redirectUri)
    requireEnv(platform === "zoom" ? "ZOOM_REDIRECT_URI" : "ASANA_REDIRECT_URI");

  return {
    ...cfg,
    clientId:
      cfg.clientId || requireEnv(platform === "zoom" ? "ZOOM_CLIENT_ID" : "ASANA_CLIENT_ID"),
    clientSecret:
      cfg.clientSecret ||
      requireEnv(platform === "zoom" ? "ZOOM_CLIENT_SECRET" : "ASANA_CLIENT_SECRET"),
    redirectUri:
      cfg.redirectUri ||
      requireEnv(platform === "zoom" ? "ZOOM_REDIRECT_URI" : "ASANA_REDIRECT_URI"),
  };
}

export function buildAuthUrl(input: {
  platform: OAuthPlatform;
  state: string;
  codeChallenge: string;
  userId: string;
}) {
  const cfg = getValidatedConfig(input.platform);
  const url = new URL(cfg.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  // Convenience/debug: provider will ignore unknown params; we still keep userId in DB state.
  url.searchParams.set("user_id", input.userId);
  return url.toString();
}

export async function exchangeCodeForTokens(
  platform: OAuthPlatform,
  code: string,
  codeVerifier: string,
): Promise<Required<Pick<OAuthTokenResponse, "access_token">> & OAuthTokenResponse> {
  const cfg = getValidatedConfig(platform);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", cfg.redirectUri);
  body.set("code_verifier", codeVerifier);

  let headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (platform === "zoom") {
    // Zoom expects HTTP Basic auth for token exchanges.
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    headers = { ...headers, Authorization: `Basic ${basic}` };
  } else {
    // Asana expects client credentials in the body.
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${platform} token exchange failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const json = JSON.parse(text) as OAuthTokenResponse;
  if (!json.access_token) {
    throw new Error(`${platform} token exchange response missing access_token`);
  }
  return json;
}


