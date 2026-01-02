// app/api/auth/[platform]/callback/route.ts
/**
 * Handle platform OAuth callback
 */

import { NextResponse } from "next/server";
import {
  exchangePlatformCode,
  fetchPlatformUserInfo,
  storePlatformConnection,
  type Platform,
} from "@/lib/auth/platform-oauth";

const SUPPORTED_PLATFORMS = new Set(["zoom", "asana", "teams"]);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const url = new URL(request.url);
  
  // Validate platform
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.redirect(
      new URL(`/auth/error?error=unsupported_platform&platform=${platform}`, BASE_URL)
    );
  }
  
  // Extract OAuth response
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  
  // Handle errors
  if (error) {
    console.error(`[Platform Callback ${platform}] OAuth error:`, error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/error?platform=${platform}&error=${error}&description=${encodeURIComponent(errorDescription || "")}`, BASE_URL)
    );
  }
  
  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/auth/error?platform=${platform}&error=missing_params`, BASE_URL)
    );
  }
  
  try {
    // Exchange code for tokens
    console.log(`[Platform Callback ${platform}] Exchanging code for tokens`);
    const { tokens, userId } = await exchangePlatformCode(platform as Platform, code, state);
    
    // Fetch user info
    console.log(`[Platform Callback ${platform}] Fetching user info`);
    const userInfo = await fetchPlatformUserInfo(platform as Platform, tokens.access_token);
    
    // Store connection
    console.log(`[Platform Callback ${platform}] Storing connection for user ${userId}`);
    await storePlatformConnection(userId, platform as Platform, tokens, userInfo);
    
    // Success - redirect to success page or close window
    return NextResponse.redirect(
      new URL(`/auth/success?platform=${platform}`, BASE_URL)
    );
    
  } catch (err) {
    console.error(`[Platform Callback ${platform}] Error:`, err);
    
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/auth/error?platform=${platform}&error=exchange_failed&description=${encodeURIComponent(message)}`, BASE_URL)
    );
  }
}
