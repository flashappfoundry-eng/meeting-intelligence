// scripts/setup-check.ts
/**
 * Pre-deployment setup verification script
 * Run: npm run setup:check
 */

import { validateEnv, printEnvStatus } from "../lib/env";

async function main() {
  console.log("🔍 Meeting Intelligence - Setup Check\n");
  
  // 1. Check environment
  printEnvStatus();
  const { valid, missing } = validateEnv();
  
  if (!valid) {
    console.error("❌ Setup incomplete. Please set the missing environment variables.\n");
    console.log("Quick fix commands:");
    
    if (missing.includes("JWT_PRIVATE_KEY") || missing.includes("JWT_PUBLIC_KEY")) {
      console.log("  npm run auth:generate-keys   # Generate JWT keys");
    }
    
    console.log("\nSee .env.local.example for all required variables.");
    process.exit(1);
  }
  
  // 2. Test database connection
  console.log("🔌 Testing database connection...");
  try {
    const { db } = await import("../lib/db/client");
    await db.execute("SELECT 1 as test");
    console.log("✅ Database connection successful\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
  
  // 3. Check OAuth endpoints
  console.log("🔐 Checking OAuth configuration...");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   OAuth Discovery: ${baseUrl}/.well-known/openid-configuration`);
  console.log(`   MCP Endpoint: ${baseUrl}/mcp`);
  console.log("");
  
  // 4. Summary
  console.log("✅ Setup check complete!\n");
  console.log("Next steps:");
  console.log("  1. Run database migrations: npm run db:push");
  console.log("  2. Start development server: npm run dev");
  console.log("  3. Test OAuth flow: Open http://localhost:3000/oauth/login");
  console.log("");
}

main().catch(console.error);

