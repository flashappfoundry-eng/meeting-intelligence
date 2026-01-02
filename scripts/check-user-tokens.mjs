// Check user and token alignment
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('=== USER & TOKEN ALIGNMENT CHECK ===\n');

  // 1. Find all users
  console.log('📋 All Users:');
  const users = await sql`
    SELECT id, email, name, created_at 
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 10
  `;
  users.forEach(u => {
    console.log(`  - ${u.email} (${u.id.substring(0, 8)}...) - ${u.created_at}`);
  });

  // 2. Find all platform connections
  console.log('\n🔗 Platform Connections:');
  const connections = await sql`
    SELECT 
      pc.user_id,
      u.email,
      pc.platform,
      pc.platform_user_id,
      pc.is_active,
      pc.created_at
    FROM platform_connections pc
    JOIN users u ON pc.user_id = u.id
    ORDER BY pc.created_at DESC
  `;
  if (connections.length === 0) {
    console.log('  (none found)');
  } else {
    connections.forEach(c => {
      console.log(`  - ${c.platform}: ${c.email} (user: ${c.user_id.substring(0, 8)}...) active=${c.is_active}`);
    });
  }

  // 3. Check oauth_tokens table (legacy)
  console.log('\n🎫 OAuth Tokens (legacy table):');
  const tokens = await sql`
    SELECT 
      ot.user_id,
      u.email,
      ot.provider,
      ot.created_at
    FROM oauth_tokens ot
    JOIN users u ON ot.user_id = u.id
    ORDER BY ot.created_at DESC
  `;
  if (tokens.length === 0) {
    console.log('  (none found)');
  } else {
    tokens.forEach(t => {
      console.log(`  - ${t.provider}: ${t.email} (user: ${t.user_id.substring(0, 8)}...)`);
    });
  }

  // 4. Check active OAuth sessions
  console.log('\n🔑 Active OAuth Sessions:');
  const sessions = await sql`
    SELECT 
      os.user_id,
      u.email,
      os.client_id,
      os.scope,
      os.created_at
    FROM oauth_sessions os
    JOIN users u ON os.user_id = u.id
    WHERE os.revoked_at IS NULL
    ORDER BY os.created_at DESC
    LIMIT 5
  `;
  if (sessions.length === 0) {
    console.log('  (none found)');
  } else {
    sessions.forEach(s => {
      console.log(`  - ${s.email} via ${s.client_id} (scope: ${s.scope})`);
    });
  }

  // 5. Summary
  console.log('\n=== SUMMARY ===');
  const mcpUser = sessions[0];
  const zoomConnection = connections.find(c => c.platform === 'zoom');
  
  if (mcpUser && zoomConnection) {
    if (mcpUser.user_id === zoomConnection.user_id) {
      console.log('✅ MCP user and Zoom connection are the SAME user');
    } else {
      console.log('❌ MISMATCH! MCP user and Zoom connection are DIFFERENT users');
      console.log(`   MCP User: ${mcpUser.email} (${mcpUser.user_id})`);
      console.log(`   Zoom User: ${zoomConnection.email} (${zoomConnection.user_id})`);
    }
  } else if (!zoomConnection) {
    console.log('⚠️  No Zoom connection found in platform_connections');
  } else if (!mcpUser) {
    console.log('⚠️  No active OAuth session found');
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });


