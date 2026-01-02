// app/oauth/userinfo/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractBearerToken, verifyAccessToken } from "@/lib/auth/jwt";

/**
 * OpenID Connect UserInfo Endpoint
 * 
 * Returns user profile information based on access token scopes
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  
  if (!token) {
    return NextResponse.json({
      error: "invalid_token",
      error_description: "Missing or invalid Authorization header",
    }, { 
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    });
  }
  
  // Verify access token
  let decoded;
  try {
    decoded = await verifyAccessToken(token);
  } catch (error) {
    console.error("[UserInfo] Token verification failed:", error);
    return NextResponse.json({
      error: "invalid_token",
      error_description: "Token verification failed",
    }, { 
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    });
  }
  
  // Get user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, decoded.sub))
    .limit(1);
  
  if (!user) {
    return NextResponse.json({
      error: "invalid_token",
      error_description: "User not found",
    }, { status: 401 });
  }
  
  // Build response based on scopes
  const scopes = decoded.scope.split(" ");
  const claims: Record<string, unknown> = {
    sub: user.id,
  };
  
  if (scopes.includes("profile")) {
    claims.name = user.name;
    claims.picture = user.avatarUrl;
  }
  
  if (scopes.includes("email")) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified;
  }
  
  return NextResponse.json(claims, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  // UserInfo can be accessed via POST as well (per spec)
  return GET(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

