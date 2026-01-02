// lib/auth/social.ts
/**
 * Social Login Configuration and Utilities
 * Supports Google and Microsoft OAuth for user authentication
 */

import crypto from "crypto";

// ============================================
// CONFIGURATION
// ============================================

export type SocialProvider = "google" | "microsoft";

interface SocialProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export function getSocialConfig(provider: SocialProvider): SocialProviderConfig {
  switch (provider) {
    case "google":
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        scopes: ["openid", "email", "profile"],
      };
    
    case "microsoft":
      return {
        authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userInfoUrl: "https://graph.microsoft.com/v1.0/me",
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        scopes: ["openid", "email", "profile", "User.Read"],
      };
    
    default:
      throw new Error(`Unknown social provider: ${provider}`);
  }
}

// ============================================
// URL BUILDERS
// ============================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export interface SocialAuthParams {
  provider: SocialProvider;
  state: string;
  codeChallenge: string;
  /** Additional state to pass through the flow (e.g., original OAuth request) */
  returnTo?: string;
}

/**
 * Build the authorization URL for social login
 */
export function buildSocialAuthUrl(params: SocialAuthParams): string {
  const config = getSocialConfig(params.provider);
  const redirectUri = `${BASE_URL}/oauth/callback/${params.provider}`;
  
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  
  // Provider-specific parameters
  if (params.provider === "google") {
    url.searchParams.set("access_type", "offline"); // Get refresh token
    url.searchParams.set("prompt", "consent"); // Always show consent for refresh token
  }
  
  if (params.provider === "microsoft") {
    url.searchParams.set("response_mode", "query");
  }
  
  return url.toString();
}

// ============================================
// TOKEN EXCHANGE
// ============================================

export interface SocialTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeSocialCode(
  provider: SocialProvider,
  code: string,
  codeVerifier: string
): Promise<SocialTokens> {
  const config = getSocialConfig(provider);
  const redirectUri = `${BASE_URL}/oauth/callback/${provider}`;
  
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });
  
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[Social ${provider}] Token exchange failed:`, error);
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  return response.json();
}

// ============================================
// USER INFO
// ============================================

export interface SocialUserInfo {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Fetch user info from the social provider
 */
export async function fetchSocialUserInfo(
  provider: SocialProvider,
  accessToken: string
): Promise<SocialUserInfo> {
  const config = getSocialConfig(provider);
  
  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[Social ${provider}] User info fetch failed:`, error);
    throw new Error(`Failed to fetch user info: ${error}`);
  }
  
  const data = await response.json();
  
  // Normalize response format (differs between providers)
  if (provider === "google") {
    return {
      id: data.sub,
      email: data.email,
      emailVerified: data.email_verified ?? false,
      name: data.name,
      picture: data.picture,
    };
  }
  
  if (provider === "microsoft") {
    return {
      id: data.id,
      email: data.mail || data.userPrincipalName,
      emailVerified: true, // Microsoft verifies emails
      name: data.displayName,
      picture: undefined, // Would need separate Graph API call for photo
    };
  }
  
  throw new Error(`Unknown provider: ${provider}`);
}

// ============================================
// STATE MANAGEMENT
// ============================================

/**
 * Generate a secure state parameter that includes metadata
 */
export function generateSocialState(metadata: Record<string, string>): string {
  const state = crypto.randomBytes(16).toString("base64url");
  const payload = { state, ...metadata };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Parse and validate a state parameter
 */
export function parseSocialState(encodedState: string): { state: string; [key: string]: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(encodedState, "base64url").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}

