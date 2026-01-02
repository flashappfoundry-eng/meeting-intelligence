// lib/env.ts
/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */

interface EnvConfig {
  // App
  NEXT_PUBLIC_BASE_URL: string;
  NODE_ENV: string;
  
  // Database
  DATABASE_URL: string;
  
  // JWT (OAuth Provider)
  JWT_PRIVATE_KEY: string;
  JWT_PUBLIC_KEY: string;
  JWT_KEY_ID: string;
  
  // Social Login (Optional but recommended)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  
  // Platform OAuth
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  ASANA_CLIENT_ID?: string;
  ASANA_CLIENT_SECRET?: string;
}

const requiredVars = [
  "DATABASE_URL",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "JWT_KEY_ID",
] as const;

/**
 * Validate environment variables
 * Call this at app startup
 */
export function validateEnv(): { valid: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  // Check required vars
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  // Check optional vars and warn
  if (!process.env.GOOGLE_CLIENT_ID && !process.env.MICROSOFT_CLIENT_ID) {
    warnings.push("No social login configured (GOOGLE_CLIENT_ID or MICROSOFT_CLIENT_ID). Users won't be able to sign in.");
  }
  
  if (!process.env.ZOOM_CLIENT_ID) {
    warnings.push("ZOOM_CLIENT_ID not set. Zoom integration will be unavailable.");
  }
  
  if (!process.env.ASANA_CLIENT_ID) {
    warnings.push("ASANA_CLIENT_ID not set. Asana integration will be unavailable.");
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Get typed environment config
 */
export function getEnvConfig(): EnvConfig {
  return {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
    NODE_ENV: process.env.NODE_ENV || "development",
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY!,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY!,
    JWT_KEY_ID: process.env.JWT_KEY_ID!,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
    ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
    ASANA_CLIENT_ID: process.env.ASANA_CLIENT_ID,
    ASANA_CLIENT_SECRET: process.env.ASANA_CLIENT_SECRET,
  };
}

/**
 * Print environment status (for debugging)
 */
export function printEnvStatus() {
  const { valid, missing, warnings } = validateEnv();
  
  console.log("\n========== Environment Status ==========");
  console.log(`Status: ${valid ? "✅ Valid" : "❌ Invalid"}`);
  
  if (missing.length > 0) {
    console.log("\n❌ Missing required variables:");
    missing.forEach(v => console.log(`   - ${v}`));
  }
  
  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    warnings.forEach(w => console.log(`   - ${w}`));
  }
  
  console.log("\n✅ Configured integrations:");
  if (process.env.GOOGLE_CLIENT_ID) console.log("   - Google Sign-In");
  if (process.env.MICROSOFT_CLIENT_ID) console.log("   - Microsoft Sign-In");
  if (process.env.ZOOM_CLIENT_ID) console.log("   - Zoom");
  if (process.env.ASANA_CLIENT_ID) console.log("   - Asana");
  
  console.log("=========================================\n");
}

