// scripts/register-chatgpt-client.ts
/**
 * Register ChatGPT as an OAuth client
 * Run: npm run setup:register-chatgpt
 */

import { db } from "../lib/db/client";
import { oauthClients } from "../lib/db/schema";
import crypto from "crypto";

async function main() {
  console.log("📝 Registering ChatGPT as OAuth Client\n");
  
  const clientId = `chatgpt-${crypto.randomBytes(8).toString("hex")}`;
  
  const [client] = await db
    .insert(oauthClients)
    .values({
      clientId,
      clientName: "ChatGPT",
      clientDescription: "OpenAI ChatGPT MCP Integration",
      redirectUris: [
        "https://chatgpt.com/aip/plugin-oauth/callback",
        "https://chat.openai.com/aip/plugin-oauth/callback",
      ],
      clientType: "public",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      allowedScopes: "openid profile email meetings:read meetings:summary tasks:write",
      isActive: true,
    })
    .returning();
  
  console.log("✅ ChatGPT client registered!\n");
  console.log("Client ID:", client.clientId);
  console.log("\nUse this Client ID when configuring the ChatGPT App in OpenAI.\n");
}

main().catch(console.error);

