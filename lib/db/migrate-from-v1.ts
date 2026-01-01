// lib/db/migrate-from-v1.ts
/**
 * Migration script to move data from v1 schema to v2 schema
 * 
 * V1 tables: users, oauth_tokens, oauth_states, meetings_cache, action_items, audit_log
 * V2 tables: (new comprehensive schema)
 * 
 * Run this AFTER applying the new schema migration
 */

import { db } from "./client";
import { sql } from "drizzle-orm";

export async function migrateFromV1() {
  console.log("[Migration] Starting v1 → v2 migration...");
  
  // Check if old tables exist
  const oldTablesExist = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'oauth_tokens'
    ) as exists
  `);
  
  if (!oldTablesExist.rows[0]?.exists) {
    console.log("[Migration] No v1 tables found, skipping migration");
    return;
  }
  
  // Begin transaction
  await db.transaction(async (tx) => {
    // 1. Migrate users (most users should already have correct structure)
    console.log("[Migration] Migrating users...");
    await tx.execute(sql`
      INSERT INTO users (id, email, name, created_at, updated_at)
      SELECT id, email, name, created_at, updated_at
      FROM users
      ON CONFLICT (id) DO NOTHING
    `);
    
    // 2. Migrate oauth_tokens → platform_connections
    console.log("[Migration] Migrating platform connections...");
    
    // Map old provider names to new platform enum
    await tx.execute(sql`
      INSERT INTO platform_connections (
        id,
        user_id,
        platform,
        platform_category,
        platform_user_id,
        platform_email,
        access_token,
        refresh_token,
        token_type,
        scope,
        expires_at,
        connected_at,
        updated_at,
        is_default,
        is_active
      )
      SELECT 
        id,
        user_id,
        CASE 
          WHEN provider = 'zoom' THEN 'zoom'::platform
          WHEN provider = 'asana' THEN 'asana'::platform
          ELSE provider::platform
        END,
        CASE 
          WHEN provider = 'zoom' THEN 'meetings'::platform_category
          WHEN provider = 'asana' THEN 'tasks'::platform_category
          ELSE 'meetings'::platform_category
        END,
        provider_user_id,
        provider_email,
        access_token,
        refresh_token,
        token_type,
        scope,
        expires_at,
        created_at,
        updated_at,
        true, -- is_default
        true  -- is_active
      FROM oauth_tokens
      WHERE user_id IN (SELECT id FROM users)
      ON CONFLICT (user_id, platform) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `);
    
    // 3. Create user_preferences for existing users
    console.log("[Migration] Creating user preferences...");
    await tx.execute(sql`
      INSERT INTO user_preferences (user_id)
      SELECT id FROM users
      ON CONFLICT (user_id) DO NOTHING
    `);
    
    // 4. Migrate meetings_cache if exists
    console.log("[Migration] Migrating meetings cache...");
    await tx.execute(sql`
      INSERT INTO meetings_cache (
        id, user_id, platform, platform_meeting_id,
        title, start_time, duration_minutes,
        participant_count, has_recording, has_transcript,
        cached_at
      )
      SELECT 
        id, user_id, 
        COALESCE(platform, 'zoom')::platform,
        platform_meeting_id,
        title, start_time, duration_minutes,
        participant_count, has_recording, has_transcript,
        COALESCE(cached_at, created_at)
      FROM meetings_cache
      WHERE user_id IN (SELECT id FROM users)
      ON CONFLICT (user_id, platform, platform_meeting_id) DO NOTHING
    `);
    
    // 5. Migrate action_items if exists
    console.log("[Migration] Migrating action items...");
    await tx.execute(sql`
      INSERT INTO action_items (
        id, user_id, meeting_cache_id,
        title, description, assignee, due_date, priority,
        context, task_created, status,
        created_at, updated_at
      )
      SELECT 
        id, user_id, meeting_cache_id,
        title, description, assignee, due_date, 
        COALESCE(priority, 'medium'),
        context, 
        COALESCE(task_created, false),
        COALESCE(status, 'pending'),
        created_at, updated_at
      FROM action_items
      WHERE user_id IN (SELECT id FROM users)
      ON CONFLICT (id) DO NOTHING
    `);
    
    console.log("[Migration] Migration complete!");
  });
  
  // Optionally: Rename old tables to backup
  console.log("[Migration] Creating backups of old tables...");
  await db.execute(sql`
    ALTER TABLE IF EXISTS oauth_tokens RENAME TO oauth_tokens_v1_backup;
  `);
  
  console.log("[Migration] v1 → v2 migration finished successfully");
}

// Export for CLI usage
if (require.main === module) {
  migrateFromV1()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Migration] Error:", err);
      process.exit(1);
    });
}

