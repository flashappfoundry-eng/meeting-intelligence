// app/api/auth/[platform]/route.ts
/**
 * Initiate platform OAuth flow
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildPlatformAuthUrl, type Platform } from "@/lib/auth/platform-oauth";

const SUPPORTED_PLATFORMS = new Set(["zoom", "asana", "teams"]);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);
  
  // Validate platform
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.json({
      error: "unsupported_platform",
      error_description: `Platform not supported: ${platform}`,
    }, { status: 400 });
  }
  
  // Get user ID from query param or session
  let userId = searchParams.get("userId");
  
  if (!userId) {
    // Try to get from session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("user_session")?.value;
    
    if (sessionCookie) {
      try {
        const session = JSON.parse(sessionCookie);
        userId = session.userId;
      } catch {
        // Ignore
      }
    }
  }
  
  if (!userId) {
    // Redirect to login with return URL
    const returnUrl = `${BASE_URL}/api/auth/${platform}`;
    return NextResponse.redirect(
      new URL(`/oauth/login?returnTo=${encodeURIComponent(returnUrl)}`, BASE_URL)
    );
  }
  
  try {
    // Build authorization URL
    const authUrl = await buildPlatformAuthUrl(
      platform as Platform,
      userId,
      searchParams.get("redirectAfter") || undefined
    );
    
    console.log(`[Platform Auth] Redirecting to ${platform} auth for user ${userId}`);
    
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error(`[Platform Auth] Error initiating ${platform} OAuth:`, error);
    
    return NextResponse.redirect(
      new URL(`/auth/error?platform=${platform}&error=init_failed`, BASE_URL)
    );
  }
}
