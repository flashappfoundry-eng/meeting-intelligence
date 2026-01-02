#!/usr/bin/env node
/**
 * Debug Zoom Token Mapping
 * 
 * This script helps diagnose user ID mismatches between:
 * - ChatGPT OAuth users (MCP authentication)
 * - Platform connections (Zoom tokens)
 * 
 * Run: node scripts/debug-zoom-mapping.mjs
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

// Load .env.local explicitly
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });
config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ No database connection string found!');
  console.error('Set POSTGRES_URL or DATABASE_URL environment variable.');
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('\n🔍 Debug Zoom Token Mapping\n');
  console.log('='.repeat(70));

  try {
    // 1. List all users
    console.log('\n📋 1. ALL USERS (most recent first):\n');
    const users = await pool.query(`
      SELECT id, email, name, created_at, last_login_at
      FROM users 
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    if (users.rows.length === 0) {
      console.log('   No users found in database.');
    } else {
      for (const user of users.rows) {
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.name || '(none)'}`);
        console.log(`   Created: ${user.created_at?.toISOString()}`);
        console.log(`   Last Login: ${user.last_login_at?.toISOString() || 'never'}`);
        console.log('');
      }
    }

    // 2. List all platform connections
    console.log('='.repeat(70));
    console.log('\n📱 2. ALL PLATFORM CONNECTIONS:\n');
    const connections = await pool.query(`
      SELECT 
        pc.id,
        pc.user_id,
        u.email as user_email,
        pc.platform,
        pc.platform_email,
        pc.platform_user_id,
        pc.is_active,
        pc.connected_at,
        pc.updated_at,
        CASE WHEN pc.access_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_access_token,
        CASE WHEN pc.refresh_token IS NOT NULL THEN 'YES' ELSE 'NO' END as has_refresh_token
      FROM platform_connections pc
      LEFT JOIN users u ON pc.user_id = u.id
      ORDER BY pc.connected_at DESC
    `);
    
    if (connections.rows.length === 0) {
      console.log('   No platform connections found.');
    } else {
      for (const conn of connections.rows) {
        console.log(`   Platform: ${conn.platform.toUpperCase()}`);
        console.log(`   User ID: ${conn.user_id}`);
        console.log(`   User Email: ${conn.user_email || '(user not found!)'}`);
        console.log(`   Platform Email: ${conn.platform_email || '(none)'}`);
        console.log(`   Active: ${conn.is_active ? 'YES' : 'NO'}`);
        console.log(`   Has Access Token: ${conn.has_access_token}`);
        console.log(`   Has Refresh Token: ${conn.has_refresh_token}`);
        console.log(`   Connected: ${conn.connected_at?.toISOString()}`);
        console.log('');
      }
    }

    // 3. Check OAuth access tokens (what ChatGPT uses)
    console.log('='.repeat(70));
    console.log('\n🔑 3. ACTIVE OAUTH ACCESS TOKENS (ChatGPT users):\n');
    const accessTokens = await pool.query(`
      SELECT 
        at.jti,
        at.user_id,
        u.email as user_email,
        at.client_id,
        at.scope,
        at.expires_at,
        at.created_at
      FROM oauth_access_tokens at
      LEFT JOIN users u ON at.user_id = u.id
      WHERE at.revoked_at IS NULL 
        AND at.expires_at > NOW()
      ORDER BY at.created_at DESC
      LIMIT 10
    `);
    
    if (accessTokens.rows.length === 0) {
      console.log('   No active OAuth tokens found.');
    } else {
      for (const token of accessTokens.rows) {
        console.log(`   Token JTI: ${token.jti.substring(0, 20)}...`);
        console.log(`   User ID: ${token.user_id}`);
        console.log(`   User Email: ${token.user_email || '(user not found!)'}`);
        console.log(`   Client ID: ${token.client_id?.substring(0, 30)}...`);
        console.log(`   Scopes: ${token.scope}`);
        console.log(`   Expires: ${token.expires_at?.toISOString()}`);
        console.log('');
      }
    }

    // 4. CRITICAL: Find users with active OAuth tokens but no Zoom connection
    console.log('='.repeat(70));
    console.log('\n⚠️  4. USERS WITH CHATGPT AUTH BUT NO ZOOM CONNECTION:\n');
    const missingZoom = await pool.query(`
      SELECT DISTINCT
        at.user_id,
        u.email,
        u.name,
        u.created_at
      FROM oauth_access_tokens at
      JOIN users u ON at.user_id = u.id
      WHERE at.revoked_at IS NULL
        AND at.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM platform_connections pc 
          WHERE pc.user_id = at.user_id 
            AND pc.platform = 'zoom'
            AND pc.is_active = true
        )
    `);
    
    if (missingZoom.rows.length === 0) {
      console.log('   ✅ All ChatGPT users have Zoom connected!');
    } else {
      console.log('   🚨 These users have ChatGPT OAuth but NO Zoom tokens:');
      for (const user of missingZoom.rows) {
        console.log(`\n   User ID: ${user.user_id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.name || '(none)'}`);
        
        // Check if there's a Zoom connection under a different user
        const otherZoom = await pool.query(`
          SELECT pc.user_id, u.email as other_email
          FROM platform_connections pc
          LEFT JOIN users u ON pc.user_id = u.id
          WHERE pc.platform = 'zoom'
            AND pc.platform_email ILIKE $1
          LIMIT 1
        `, [`%${user.email.split('@')[1]}%`]);
        
        if (otherZoom.rows.length > 0 && otherZoom.rows[0].user_id !== user.user_id) {
          console.log(`   ⚡ FOUND: Zoom tokens exist under DIFFERENT user:`);
          console.log(`      Other User ID: ${otherZoom.rows[0].user_id}`);
          console.log(`      Other Email: ${otherZoom.rows[0].other_email}`);
        }
      }
    }

    // 5. Show mapping recommendation
    console.log('\n');
    console.log('='.repeat(70));
    console.log('\n📌 DIAGNOSIS SUMMARY:\n');
    
    const summary = await pool.query(`
      WITH chatgpt_users AS (
        SELECT DISTINCT user_id FROM oauth_access_tokens 
        WHERE revoked_at IS NULL AND expires_at > NOW()
      ),
      zoom_users AS (
        SELECT DISTINCT user_id FROM platform_connections 
        WHERE platform = 'zoom' AND is_active = true
      )
      SELECT 
        (SELECT COUNT(*) FROM chatgpt_users) as chatgpt_user_count,
        (SELECT COUNT(*) FROM zoom_users) as zoom_user_count,
        (SELECT COUNT(*) FROM chatgpt_users c JOIN zoom_users z ON c.user_id = z.user_id) as aligned_count
    `);
    
    const s = summary.rows[0];
    console.log(`   Users with active ChatGPT OAuth: ${s.chatgpt_user_count}`);
    console.log(`   Users with Zoom connection: ${s.zoom_user_count}`);
    console.log(`   Users with BOTH (aligned): ${s.aligned_count}`);
    
    if (parseInt(s.chatgpt_user_count) > parseInt(s.aligned_count)) {
      console.log(`\n   ⚠️  ${parseInt(s.chatgpt_user_count) - parseInt(s.aligned_count)} user(s) need to connect Zoom!`);
      console.log('\n   SOLUTION:');
      console.log('   1. Have the user click the "Connect Zoom" link that MCP provides');
      console.log('   2. Ensure the userId in the URL matches their ChatGPT OAuth user ID');
      console.log('   3. Complete the Zoom OAuth flow');
    } else {
      console.log('\n   ✅ All users appear to be properly aligned!');
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Could not connect to database.');
    }
  } finally {
    await pool.end();
  }
}

main();

