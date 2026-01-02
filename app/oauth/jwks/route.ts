// app/oauth/jwks/route.ts
import { NextResponse } from "next/server";
import { getJWKS } from "@/lib/auth/jwt";

export async function GET() {
  try {
    console.log("[JWKS] Fetching JWKS...");
    console.log("[JWKS] JWT_PUBLIC_KEY exists:", !!process.env.JWT_PUBLIC_KEY);
    console.log("[JWKS] JWT_KEY_ID:", process.env.JWT_KEY_ID);
    
    const jwks = await getJWKS();
    
    console.log("[JWKS] Generated JWKS:", JSON.stringify(jwks, null, 2));
    
    return NextResponse.json(jwks, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[JWKS] Error generating JWKS:", error);
    
    // Return error details in development
    return NextResponse.json(
      { 
        keys: [],
        error: process.env.NODE_ENV === "development" ? String(error) : "Internal error",
      },
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
    },
  });
}
