// scripts/generate-jwt-keys.ts
/**
 * Script to generate RSA key pair for JWT signing
 * Run: npm run auth:generate-keys
 */

import { generateKeyPairForSetup } from "../lib/auth/jwt";

async function main() {
  console.log("🔐 Generating RSA key pair for JWT signing...\n");
  
  const { privateKey, publicKey, keyId } = await generateKeyPairForSetup();
  
  console.log("✅ Keys generated successfully!\n");
  console.log("Add these to your .env.local and Vercel environment variables:\n");
  console.log("─".repeat(60));
  
  // Format for .env file (escape newlines)
  const privateKeyEnv = privateKey.replace(/\n/g, "\\n");
  const publicKeyEnv = publicKey.replace(/\n/g, "\\n");
  
  console.log(`JWT_KEY_ID="${keyId}"`);
  console.log("");
  console.log(`JWT_PRIVATE_KEY="${privateKeyEnv}"`);
  console.log("");
  console.log(`JWT_PUBLIC_KEY="${publicKeyEnv}"`);
  console.log("");
  console.log("─".repeat(60));
  
  console.log("\n⚠️  IMPORTANT:");
  console.log("1. Keep JWT_PRIVATE_KEY secret - never commit to git");
  console.log("2. Add both keys to Vercel environment variables");
  console.log("3. JWT_PUBLIC_KEY can be public (used for token verification)");
  console.log("4. Rotate keys periodically for security\n");
}

main().catch((err) => {
  console.error("Error generating keys:", err);
  process.exit(1);
});

