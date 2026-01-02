// app/oauth/callback/[provider]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { users, userPreferences, oauthAuthorizationCodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  type SocialProvider,
  exchangeSocialCode,
  fetchSocialUserInfo,
  parseSocialState,
} from "@/lib/auth/social";
import { generateAuthorizationCode, getAuthCodeExpiry } from "@/lib/auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";
const VALID_PROVIDERS = new Set(["google", "microsoft"]);

/**
 * Handle social login callback
 * 
 * GET /oauth/callback/google?code=...&state=...
 * GET /oauth/callback/microsoft?code=...&state=...
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const url = new URL(request.url);
  
  // Validate provider
  if (!VALID_PROVIDERS.has(provider)) {
    return redirectWithError("invalid_provider", `Invalid provider: ${provider}`);
  }
  
  const socialProvider = provider as SocialProvider;
  
  // Extract OAuth response
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  
  // Handle OAuth errors
  if (error) {
    console.error(`[Social Callback ${provider}] OAuth error:`, error, errorDescription);
    return redirectWithError(error, errorDescription || "Authentication failed");
  }
  
  if (!code || !state) {
    return redirectWithError("invalid_request", "Missing code or state parameter");
  }
  
  // Retrieve and validate stored state
  const cookieStore = await cookies();
  const storedState = cookieStore.get(`social_${provider}_state`)?.value;
  const codeVerifier = cookieStore.get(`social_${provider}_verifier`)?.value;
  
  if (!storedState || state !== storedState) {
    console.error(`[Social Callback ${provider}] State mismatch`);
    return redirectWithError("invalid_state", "State validation failed");
  }
  
  if (!codeVerifier) {
    return redirectWithError("invalid_request", "Missing code verifier");
  }
  
  // Parse state metadata
  parseSocialState(state);
  
  try {
    // Exchange code for tokens
    console.log(`[Social Callback ${provider}] Exchanging code for tokens`);
    const tokens = await exchangeSocialCode(socialProvider, code, codeVerifier);
    
    // Fetch user info
    console.log(`[Social Callback ${provider}] Fetching user info`);
    const userInfo = await fetchSocialUserInfo(socialProvider, tokens.access_token);
    
    console.log(`[Social Callback ${provider}] User info:`, {
      email: userInfo.email,
      name: userInfo.name,
    });
    
    // Find or create user
    const user = await findOrCreateUser(socialProvider, userInfo);
    
    // Clean up OAuth cookies
    cookieStore.delete(`social_${provider}_verifier`);
    cookieStore.delete(`social_${provider}_state`);
    
    // Check if there's a pending OAuth authorization request
    const authRequestCookie = cookieStore.get("oauth_auth_request")?.value;
    
    if (authRequestCookie) {
      // Complete the OAuth flow for ChatGPT
      const authRequest = JSON.parse(authRequestCookie);
      
      // Generate authorization code
      const authCode = generateAuthorizationCode();
      const expiresAt = getAuthCodeExpiry();
      
      // Store authorization code
      await db.insert(oauthAuthorizationCodes).values({
        code: authCode,
        clientId: authRequest.clientId,
        userId: user.id,
        redirectUri: authRequest.redirectUri,
        scope: authRequest.scope,
        codeChallenge: authRequest.codeChallenge,
        codeChallengeMethod: authRequest.codeChallengeMethod,
        nonce: authRequest.nonce,
        state: authRequest.state,
        expiresAt,
      });
      
      // Clear auth request cookie
      cookieStore.delete("oauth_auth_request");
      
      // Redirect back to ChatGPT with the authorization code
      const redirectUrl = new URL(authRequest.redirectUri);
      redirectUrl.searchParams.set("code", authCode);
      if (authRequest.state) {
        redirectUrl.searchParams.set("state", authRequest.state);
      }
      
      console.log(`[Social Callback ${provider}] Redirecting to ChatGPT with auth code`);
      return NextResponse.redirect(redirectUrl);
    }
    
    // No pending OAuth request - just log the user in and show success
    // Set a session cookie for the user
    cookieStore.set("user_session", JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      loginAt: Date.now(),
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });
    
    // Redirect to success page or dashboard
    return NextResponse.redirect(new URL("/oauth/login/success", BASE_URL));
    
  } catch (err) {
    console.error(`[Social Callback ${provider}] Error:`, err);
    return redirectWithError(
      "server_error",
      err instanceof Error ? err.message : "Authentication failed"
    );
  }
}

/**
 * Find existing user or create new one
 */
async function findOrCreateUser(
  provider: SocialProvider,
  userInfo: { id: string; email: string; emailVerified: boolean; name?: string; picture?: string }
) {
  // First, try to find by provider ID
  const providerIdField = provider === "google" ? "googleId" : "microsoftId";
  
  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users[providerIdField], userInfo.id))
    .limit(1);
  
  if (existingUser) {
    // Update user info
    await db
      .update(users)
      .set({
        email: userInfo.email,
        emailVerified: userInfo.emailVerified,
        name: userInfo.name || existingUser.name,
        avatarUrl: userInfo.picture || existingUser.avatarUrl,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));
    
    return existingUser;
  }
  
  // Try to find by email (link accounts)
  [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, userInfo.email))
    .limit(1);
  
  if (existingUser) {
    // Link this provider to existing account
    await db
      .update(users)
      .set({
        [providerIdField]: userInfo.id,
        emailVerified: userInfo.emailVerified || existingUser.emailVerified,
        name: userInfo.name || existingUser.name,
        avatarUrl: userInfo.picture || existingUser.avatarUrl,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));
    
    return existingUser;
  }
  
  // Create new user
  console.log(`[Social] Creating new user for ${userInfo.email}`);
  
  const [newUser] = await db
    .insert(users)
    .values({
      email: userInfo.email,
      emailVerified: userInfo.emailVerified,
      name: userInfo.name,
      avatarUrl: userInfo.picture,
      [providerIdField]: userInfo.id,
      lastLoginAt: new Date(),
    })
    .returning();
  
  // Create default preferences
  await db.insert(userPreferences).values({
    userId: newUser.id,
  });
  
  return newUser;
}

/**
 * Redirect to login page with error
 */
function redirectWithError(error: string, description: string) {
  const url = new URL("/oauth/login", BASE_URL);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  return NextResponse.redirect(url);
}

