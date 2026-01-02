// app/api/connections/[platform]/route.ts
/**
 * API endpoint to disconnect a platform
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { platformConnections, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Platform } from "@/lib/db/schema";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  
  try {
    // Soft delete - mark as inactive
    const [updated] = await db
      .update(platformConnections)
      .set({ 
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(platformConnections.userId, userId),
          eq(platformConnections.platform, platform as Platform)
        )
      )
      .returning();
    
    if (!updated) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    
    // Log the disconnection
    await db.insert(auditLog).values({
      userId,
      eventType: "platform.disconnected",
      eventCategory: "settings",
      resourceType: "platform_connection",
      resourceId: updated.id,
      description: `Disconnected ${platform}`,
      metadata: { platform },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API Disconnect] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

