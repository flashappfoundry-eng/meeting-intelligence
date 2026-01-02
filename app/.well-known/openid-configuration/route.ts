// app/.well-known/openid-configuration/route.ts
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

/**
 * OpenID Connect Discovery (RFC 8414)
 * 
 * Provides complete OAuth 2.1 / OIDC server metadata
 * ChatGPT reads this to configure OAuth flow
 */
export async function GET() {
  const metadata = {
    // ============================================
    // ISSUER
    // ============================================
    issuer: BASE_URL,
    
    // ============================================
    // ENDPOINTS
    // ============================================
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    userinfo_endpoint: `${BASE_URL}/oauth/userinfo`,
    jwks_uri: `${BASE_URL}/oauth/jwks`,
    
    // Dynamic Client Registration (optional, for auto-registration)
    registration_endpoint: `${BASE_URL}/oauth/register`,
    
    // Token revocation (optional)
    revocation_endpoint: `${BASE_URL}/oauth/revoke`,
    
    // ============================================
    // SUPPORTED FEATURES
    // ============================================
    
    // OAuth 2.1 response types
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    
    // Grant types
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
    ],
    
    // PKCE is REQUIRED (OAuth 2.1)
    code_challenge_methods_supported: ["S256"],
    
    // Client authentication at token endpoint
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none", // For public clients like ChatGPT
    ],
    
    // ============================================
    // SCOPES & CLAIMS
    // ============================================
    
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "offline_access",   // For refresh tokens
      "meetings:read",
      "meetings:summary",
      "tasks:write",
      "email:draft",
    ],
    
    claims_supported: [
      // Standard OIDC claims
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "nonce",
      // Profile claims
      "name",
      "email",
      "email_verified",
      "picture",
    ],
    
    // ============================================
    // SIGNING & ENCRYPTION
    // ============================================
    
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_signing_alg_values_supported: ["RS256"],
    
    // ============================================
    // UI ENDPOINTS (for user-facing pages)
    // ============================================
    
    // Where users manage their account
    service_documentation: `${BASE_URL}/docs`,
    
    // ============================================
    // ADDITIONAL METADATA
    // ============================================
    
    // Supported UI locales
    ui_locales_supported: ["en"],
    
    // Claims parameter supported
    claims_parameter_supported: false,
    
    // Request parameter supported
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  };
  
  return NextResponse.json(metadata, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

