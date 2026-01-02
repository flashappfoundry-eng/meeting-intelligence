// Debug user and token alignment
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('=== DEBUG: User & Token Alignment ===\n');
  
  // 1. Find all users
  console.log('1. ALL USERS:');
  console.log('-'.repeat(80));
  const users = await sql`
    SELECT id, email, name, created_at 
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 10
  `;
  for (const u of users) {
    console.log(`  ${u.id} | ${u.email} | ${u.name || 'no name'} | ${u.created_at}`);
  }
  
  // 2. Find all platform connections
  console.log('\n2. PLATFORM CONNECTIONS:');
  console.log('-'.repeat(80));
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
    console.log('  (no platform connections found)');
  } else {
    for (const c of connections) {
      console.log(`  ${c.platform} | ${c.email} | user_id: ${c.user_id} | active: ${c.is_active}`);
    }
  }
  
  // 3. Check oauth_tokens table (legacy)
  console.log('\n3. OAUTH TOKENS (legacy table):');
  console.log('-'.repeat(80));
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
    console.log('  (no oauth tokens found)');
  } else {
    for (const t of tokens) {
      console.log(`  ${t.provider} | ${t.email} | user_id: ${t.user_id}`);
    }
  }
  
  // 4. Check for the specific MCP user
  console.log('\n4. MCP USER CHECK (110045f4-f9be-478f-a9d4-de2d1425b3ec):');
  console.log('-'.repeat(80));
  const mcpUser = await sql`
    SELECT id, email, name FROM users 
    WHERE id = '110045f4-f9be-478f-a9d4-de2d1425b3ec'
  `;
  if (mcpUser.length > 0) {
    console.log(`  Found: ${mcpUser[0].email}`);
    
    // Check their connections
    const mcpConnections = await sql`
      SELECT platform, platform_user_id, is_active 
      FROM platform_connections 
      WHERE user_id = '110045f4-f9be-478f-a9d4-de2d1425b3ec'
    `;
    console.log(`  Platform connections: ${mcpConnections.length}`);
    for (const c of mcpConnections) {
      console.log(`    - ${c.platform}: ${c.platform_user_id} (active: ${c.is_active})`);
    }
    
    // Check legacy tokens
    const mcpTokens = await sql`
      SELECT provider FROM oauth_tokens 
      WHERE user_id = '110045f4-f9be-478f-a9d4-de2d1425b3ec'
    `;
    console.log(`  Legacy oauth_tokens: ${mcpTokens.length}`);
    for (const t of mcpTokens) {
      console.log(`    - ${t.provider}`);
    }
  } else {
    console.log('  NOT FOUND!');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSIS:');
  console.log('='.repeat(80));
  
  // Summary
  const zoomConnections = connections.filter(c => c.platform === 'zoom');
  if (zoomConnections.length === 0) {
    console.log('❌ NO ZOOM CONNECTIONS FOUND in platform_connections table');
    console.log('   User needs to connect Zoom via the web app first.');
  } else {
    for (const z of zoomConnections) {
      const isMcpUser = z.user_id === '110045f4-f9be-478f-a9d4-de2d1425b3ec';
      console.log(`${isMcpUser ? '✅' : '⚠️'} Zoom connected for: ${z.email} (${z.user_id})`);
      if (!isMcpUser) {
        console.log('   ⚠️  This is NOT the MCP user! User ID mismatch.');
      }
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

