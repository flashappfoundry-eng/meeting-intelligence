// app/api/connections/route.ts
/**
 * API endpoint to get user's platform connections
 * Used by the connection-status widget
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, platformConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  
  try {
    // Get user
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Get connections
    const connections = await db
      .select({
        platform: platformConnections.platform,
        platformCategory: platformConnections.platformCategory,
        platformEmail: platformConnections.platformEmail,
        platformDisplayName: platformConnections.platformDisplayName,
        isDefault: platformConnections.isDefault,
        connectedAt: platformConnections.connectedAt,
      })
      .from(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.isActive, true)
        )
      );
    
    return NextResponse.json({
      user,
      connections,
    });
  } catch (error) {
    console.error("[API Connections] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

