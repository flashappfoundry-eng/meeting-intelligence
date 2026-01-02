// app/.well-known/oauth-protected-resource/route.ts
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";

/**
 * Protected Resource Metadata (RFC 9728)
 * 
 * ChatGPT uses this to discover:
 * - Which authorization server protects this resource
 * - What scopes are required
 * - How to send tokens
 */
export async function GET() {
  const metadata = {
    // The MCP endpoint is the protected resource
    resource: `${BASE_URL}/mcp`,
    
    // This app is its own authorization server
    authorization_servers: [BASE_URL],
    
    // Scopes that can be requested for this resource
    scopes_supported: [
      "openid",           // Required for OIDC
      "profile",          // User profile info
      "email",            // User email
      "meetings:read",    // List and view meetings
      "meetings:summary", // Generate meeting summaries
      "tasks:write",      // Create tasks in connected platforms
      "email:draft",      // Draft follow-up emails (Phase 2)
    ],
    
    // How tokens should be sent
    bearer_methods_supported: ["header"],
    
    // Token format
    resource_signing_alg_values_supported: ["RS256"],
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

