// lib/db/client.ts
/**
 * Database Client
 * Singleton connection to Neon Postgres via Drizzle ORM
 */

import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import * as schema from "./schema";

// Lazy-initialized database client
let _db: NeonHttpDatabase<typeof schema> | null = null;
let _sql: NeonQueryFunction<false, false> | null = null;

function getDatabase(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set.\n" +
      "Get your connection string from: https://console.neon.tech"
    );
  }
  
  // Create Neon client
  _sql = neon(databaseUrl);
  
  // Create Drizzle instance with schema
  _db = drizzle(_sql, { schema });
  
  return _db;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const database = getDatabase();
    const value = database[prop as keyof typeof database];
    if (typeof value === "function") {
      return value.bind(database);
    }
    return value;
  },
});

// Export for type inference
export type Database = typeof db;
