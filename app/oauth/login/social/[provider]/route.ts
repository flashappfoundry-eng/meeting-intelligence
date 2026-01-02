// app/oauth/login/social/[provider]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  type SocialProvider,
  buildSocialAuthUrl,
  generateSocialState,
} from "@/lib/auth/social";
import { generateCodeVerifier, generateCodeChallenge } from "@/lib/auth/jwt";

const VALID_PROVIDERS = new Set(["google", "microsoft"]);

/**
 * Initiate social login flow
 * 
 * GET /oauth/login/social/google
 * GET /oauth/login/social/microsoft
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({
      error: "invalid_provider",
      error_description: `Invalid provider: ${provider}. Valid: google, microsoft`,
    }, { status: 400 });
  }
  
  const socialProvider = provider as SocialProvider;
  
  // Check environment variables
  const config = {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    },
  };
  
  if (!config[socialProvider].clientId || !config[socialProvider].clientSecret) {
    console.error(`[Social Login] ${provider} credentials not configured`);
    return NextResponse.redirect(
      new URL(`/oauth/login?error=provider_not_configured&provider=${provider}`, request.url)
    );
  }
  
  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Generate state with metadata
  const state = generateSocialState({
    provider: socialProvider,
    timestamp: Date.now().toString(),
  });
  
  // Store PKCE verifier and state in cookies
  const cookieStore = await cookies();
  
  cookieStore.set(`social_${provider}_verifier`, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  
  cookieStore.set(`social_${provider}_state`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  
  // Build and redirect to social auth URL
  const authUrl = buildSocialAuthUrl({
    provider: socialProvider,
    state,
    codeChallenge,
  });
  
  console.log(`[Social Login] Redirecting to ${provider} auth`);
  
  return NextResponse.redirect(authUrl);
}

