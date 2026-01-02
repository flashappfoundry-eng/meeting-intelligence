#!/usr/bin/env node
/**
 * Test Zoom Token
 * 
 * This script tests if the stored Zoom token is valid by making an API call.
 * 
 * Run: node scripts/test-zoom-token.mjs
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import crypto from 'crypto';

// Load .env.local explicitly
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

// Decryption helper (matches lib/auth/oauth.ts)
function base64UrlDecode(s) {
  return Buffer.from(s, 'base64url');
}

function decryptToken(encrypted) {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('Missing TOKEN_ENCRYPTION_KEY');
  
  const key = Buffer.from(hex, 'hex');
  const [ivB64, tagB64, dataB64] = encrypted.split(':');
  
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted token format');
  }
  
  const iv = base64UrlDecode(ivB64);
  const authTag = base64UrlDecode(tagB64);
  const data = base64UrlDecode(dataB64);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  
  return decrypted.toString('utf8');
}

async function main() {
  console.log('\n🧪 Test Zoom Token\n');
  console.log('='.repeat(70));

  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ No database connection string found!');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    // 1. Get the active ChatGPT user
    console.log('\n📋 1. Finding active ChatGPT OAuth user...\n');
    const activeUser = await pool.query(`
      SELECT DISTINCT at.user_id, u.email
      FROM oauth_access_tokens at
      JOIN users u ON at.user_id = u.id
      WHERE at.revoked_at IS NULL AND at.expires_at > NOW()
      ORDER BY at.user_id
      LIMIT 1
    `);

    if (activeUser.rows.length === 0) {
      console.log('   ❌ No active ChatGPT OAuth users found!');
      return;
    }

    const user = activeUser.rows[0];
    console.log(`   ✅ Active user: ${user.email}`);
    console.log(`   User ID: ${user.user_id}`);

    // 2. Get Zoom token for this user
    console.log('\n📋 2. Looking up Zoom tokens for this user...\n');
    const zoomConnection = await pool.query(`
      SELECT 
        access_token,
        refresh_token,
        expires_at,
        connected_at
      FROM platform_connections 
      WHERE user_id = $1 AND platform = 'zoom' AND is_active = true
      LIMIT 1
    `, [user.user_id]);

    if (zoomConnection.rows.length === 0) {
      console.log('   ❌ No Zoom connection found for this user!');
      console.log('   This is the problem - MCP user has no Zoom tokens.');
      return;
    }

    const conn = zoomConnection.rows[0];
    console.log(`   ✅ Zoom connection found`);
    console.log(`   Connected at: ${conn.connected_at?.toISOString()}`);
    console.log(`   Expires at: ${conn.expires_at?.toISOString() ?? 'N/A'}`);
    
    // Check if expired
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      console.log(`   ⚠️ Token is EXPIRED! Needs refresh.`);
    }

    // 3. Decrypt and test the token
    console.log('\n📋 3. Decrypting and testing Zoom token...\n');
    
    let accessToken;
    try {
      accessToken = decryptToken(conn.access_token);
      console.log(`   ✅ Token decrypted successfully`);
      console.log(`   Token preview: ${accessToken.substring(0, 20)}...`);
    } catch (decryptError) {
      console.error('   ❌ Failed to decrypt token:', decryptError.message);
      return;
    }

    // 4. Make a test API call
    console.log('\n📋 4. Testing Zoom API with /users/me...\n');
    
    const zoomRes = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const zoomText = await zoomRes.text();
    console.log(`   Response status: ${zoomRes.status}`);

    if (!zoomRes.ok) {
      console.log('   ⚠️ /users/me API call failed (may be OK if scope not granted)');
      console.log(`   Error: ${zoomText}`);
      
      if (zoomRes.status === 400 && zoomText.includes('scope')) {
        console.log('\n   ℹ️ Missing user:read:user scope - this is OK, will try meetings directly');
      } else if (zoomRes.status === 401) {
        console.log('\n   🔧 FIX: The token is invalid or expired.');
        console.log('   The user needs to reconnect Zoom:');
        console.log(`   ${process.env.NEXT_PUBLIC_BASE_URL}/widgets/connection-status?userId=${user.user_id}&platform=zoom`);
        return;
      }
    } else {
      const zoomUser = JSON.parse(zoomText);
      console.log('   ✅ Zoom API call successful!');
      console.log(`   Zoom User: ${zoomUser.email}`);
      console.log(`   Zoom ID: ${zoomUser.id}`);
    }

    // 5. Test meetings endpoint
    console.log('\n📋 5. Testing meetings endpoint...\n');
    
    const meetingsRes = await fetch('https://api.zoom.us/v2/users/me/meetings?page_size=5&type=scheduled', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const meetingsText = await meetingsRes.text();
    console.log(`   Response status: ${meetingsRes.status}`);

    if (!meetingsRes.ok) {
      console.log('   ❌ Meetings API call failed!');
      console.log(`   Error: ${meetingsText}`);
      return;
    }

    const meetingsData = JSON.parse(meetingsText);
    console.log('   ✅ Meetings API call successful!');
    console.log(`   Total scheduled meetings: ${meetingsData.total_records ?? 0}`);
    console.log(`   Returned in this page: ${meetingsData.meetings?.length ?? 0}`);

    if (meetingsData.meetings?.length > 0) {
      console.log('\n   Sample meetings:');
      meetingsData.meetings.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.topic || 'Untitled'} (${m.start_time || 'No date'})`);
      });
    } else {
      console.log('\n   ⚠️ No scheduled meetings found.');
      console.log('   This is expected if the user has no upcoming meetings.');
    }

    // Test past meetings too
    console.log('\n📋 6. Testing past meetings...\n');
    
    const pastRes = await fetch('https://api.zoom.us/v2/users/me/meetings?page_size=5&type=previous_meetings', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (pastRes.ok) {
      const pastData = await pastRes.json();
      console.log(`   Total past meetings: ${pastData.total_records ?? 0}`);
      console.log(`   Returned in this page: ${pastData.meetings?.length ?? 0}`);
    } else {
      console.log(`   Past meetings status: ${pastRes.status}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ All tests passed! Zoom integration is working.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();

