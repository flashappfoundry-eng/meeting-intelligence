// Add public-client to database
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('Adding public-client to database...');
  
  await sql`
    INSERT INTO oauth_clients (
      client_id,
      client_name,
      client_description,
      redirect_uris,
      client_type,
      grant_types,
      response_types,
      allowed_scopes,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      'public-client',
      'ChatGPT Public Client',
      'Default public client for ChatGPT OAuth flow',
      '["https://chat.openai.com/aip/g-378b44bcbe94386cbfef27622618fea97227c614/oauth/callback", "https://chatgpt.com/aip/g-378b44bcbe94386cbfef27622618fea97227c614/oauth/callback", "https://chatgpt.com/aip/plugin-oauth/callback", "https://chat.openai.com/aip/plugin-oauth/callback"]'::jsonb,
      'public',
      '["authorization_code", "refresh_token"]'::jsonb,
      '["code"]'::jsonb,
      'openid profile email meetings:read meetings:summary tasks:write',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (client_id) DO UPDATE SET
      redirect_uris = EXCLUDED.redirect_uris,
      client_name = EXCLUDED.client_name,
      updated_at = NOW()
  `;
  
  console.log('✅ public-client added/updated!');
  
  // Verify
  const clients = await sql`SELECT client_id, client_name FROM oauth_clients`;
  console.log('\nRegistered clients:');
  for (const c of clients) {
    console.log('  -', c.client_id + ':', c.client_name);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

