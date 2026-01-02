// scripts/update-chatgpt-client.ts
/**
 * Update ChatGPT OAuth client with new redirect URI
 */

import { db } from "../lib/db/client";
import { oauthClients } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("📝 Updating ChatGPT OAuth Client Redirect URIs\n");
  
  const clientId = "chatgpt-e00d5527acab44ea";
  
  // New redirect URIs including the one ChatGPT generated
  const redirectUris = [
    "https://chatgpt.com/aip/plugin-oauth/callback",
    "https://chat.openai.com/aip/plugin-oauth/callback",
    "https://chat.openai.com/aip/g-01b1bbc990ecb1e3c89e7228047bd77800a39ab3/oauth/callback",
  ];
  
  const [updated] = await db
    .update(oauthClients)
    .set({
      redirectUris,
      updatedAt: new Date(),
    })
    .where(eq(oauthClients.clientId, clientId))
    .returning();
  
  if (updated) {
    console.log("✅ ChatGPT client updated!\n");
    console.log("Client ID:", updated.clientId);
    console.log("Redirect URIs:");
    redirectUris.forEach(uri => console.log(`  - ${uri}`));
  } else {
    console.error("❌ Client not found:", clientId);
  }
}

main().catch(console.error);

