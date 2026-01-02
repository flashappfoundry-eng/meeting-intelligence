// app/oauth/jwks/route.ts
import { NextResponse } from "next/server";
import { getJWKS } from "@/lib/auth/jwt";

/**
 * JSON Web Key Set (JWKS) Endpoint
 * 
 * Provides the public key(s) used to verify tokens
 * ChatGPT fetches this to verify access tokens
 */
export async function GET() {
  try {
    const jwks = await getJWKS();
    
    return NextResponse.json(jwks, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[JWKS] Error generating JWKS:", error);
    
    // Return empty JWKS rather than error (more graceful)
    return NextResponse.json(
      { keys: [] },
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
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

