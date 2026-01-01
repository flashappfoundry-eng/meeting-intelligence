// lib/db/schema.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// ============================================
// ENUMS
// ============================================

export const platformEnum = pgEnum("platform", [
  // Meeting platforms
  "zoom",
  "teams", 
  "meet",
  "webex",
  // Task platforms
  "asana",
  "jira",
  "notion",
  "linear",
  "trello",
  "monday",
  // Communication platforms
  "slack",
  "gmail",
  "outlook",
]);

export const platformCategoryEnum = pgEnum("platform_category", [
  "meetings",
  "tasks",
  "email",
  "communication",
]);

// ============================================
// CORE IDENTITY
// ============================================

/**
 * Users - Core user identity
 * Created when user first authenticates via OAuth
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Identity (from social login or email)
  email: varchar("email", { length: 320 }).notNull(),
  emailVerified: boolean("email_verified").default(false),
  name: varchar("name", { length: 256 }),
  avatarUrl: text("avatar_url"),
  
  // Social login identifiers
  googleId: varchar("google_id", { length: 256 }),
  microsoftId: varchar("microsoft_id", { length: 256 }),
  
  // Account status
  isActive: boolean("is_active").default(true),
  
  // Enterprise (future)
  organizationId: uuid("organization_id"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (table) => ({
  emailIdx: uniqueIndex("users_email_unique").on(table.email),
  googleIdIdx: index("users_google_id_idx").on(table.googleId),
  microsoftIdIdx: index("users_microsoft_id_idx").on(table.microsoftId),
}));

/**
 * User Preferences - Customizable settings
 */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  
  // Meeting preferences
  defaultMeetingPlatform: platformEnum("default_meeting_platform"),
  autoSummarize: boolean("auto_summarize").default(false),
  summaryLanguage: varchar("summary_language", { length: 10 }).default("en"),
  
  // Task preferences
  defaultTaskPlatform: platformEnum("default_task_platform"),
  autoCreateTasks: boolean("auto_create_tasks").default(false),
  
  // Email preferences
  defaultEmailTone: varchar("default_email_tone", { length: 50 }).default("professional"),
  emailSignature: text("email_signature"),
  
  // Summary preferences
  summaryStyle: varchar("summary_style", { length: 50 }).default("concise"), // "concise" | "detailed" | "bullet_points"
  includeActionItems: boolean("include_action_items").default(true),
  includeKeyDecisions: boolean("include_key_decisions").default(true),
  
  // Privacy & data
  retainTranscriptsHours: integer("retain_transcripts_hours").default(0), // 0 = don't retain
  allowAnalytics: boolean("allow_analytics").default(true),
  
  // Timezone
  timezone: varchar("timezone", { length: 64 }).default("America/Chicago"),
  
  // Extensible settings (JSONB for future additions without migrations)
  additionalSettings: jsonb("additional_settings").default({}),
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================
// OAUTH PROVIDER (for ChatGPT authentication)
// ============================================

/**
 * OAuth Clients - Registered OAuth clients (ChatGPT, etc.)
 */
export const oauthClients = pgTable("oauth_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Client credentials
  clientId: varchar("client_id", { length: 256 }).notNull(),
  clientSecret: text("client_secret"), // Hashed, null for public clients
  clientName: varchar("client_name", { length: 256 }).notNull(),
  clientDescription: text("client_description"),
  clientUri: text("client_uri"), // Homepage
  logoUri: text("logo_uri"),
  
  // OAuth configuration
  redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
  allowedOrigins: jsonb("allowed_origins").$type<string[]>(),
  
  // Client capabilities
  clientType: varchar("client_type", { length: 50 }).notNull().default("confidential"),
  grantTypes: jsonb("grant_types").notNull().$type<string[]>().default(["authorization_code", "refresh_token"]),
  responseTypes: jsonb("response_types").notNull().$type<string[]>().default(["code"]),
  
  // Scopes this client can request
  allowedScopes: text("allowed_scopes").notNull().default("openid profile email meetings:read meetings:summary tasks:write"),
  
  // Dynamic client registration
  registrationAccessToken: text("registration_access_token"),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: uniqueIndex("oauth_clients_client_id_unique").on(table.clientId),
}));

/**
 * Authorization Codes - Temporary codes for OAuth flow
 */
export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  code: varchar("code", { length: 256 }).notNull(),
  
  // References
  clientId: varchar("client_id", { length: 256 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // OAuth parameters
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope").notNull(),
  
  // PKCE (required for OAuth 2.1)
  codeChallenge: varchar("code_challenge", { length: 256 }).notNull(),
  codeChallengeMethod: varchar("code_challenge_method", { length: 10 }).notNull().default("S256"),
  
  // OpenID Connect
  nonce: varchar("nonce", { length: 256 }),
  
  // State
  state: varchar("state", { length: 256 }),
  
  // Lifecycle
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex("oauth_authorization_codes_code_unique").on(table.code),
  expiresIdx: index("oauth_authorization_codes_expires_idx").on(table.expiresAt),
}));

/**
 * App Access Tokens - Tokens issued BY this app (for ChatGPT)
 */
export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  jti: varchar("jti", { length: 256 }).notNull(), // JWT ID
  
  // References
  clientId: varchar("client_id", { length: 256 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Token metadata
  scope: text("scope").notNull(),
  
  // Lifecycle
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jtiIdx: uniqueIndex("oauth_access_tokens_jti_unique").on(table.jti),
  userIdx: index("oauth_access_tokens_user_idx").on(table.userId),
}));

/**
 * App Refresh Tokens - Refresh tokens issued BY this app
 */
export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  jti: varchar("jti", { length: 256 }).notNull(),
  
  // References
  clientId: varchar("client_id", { length: 256 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Token metadata
  scope: text("scope").notNull(),
  
  // Rotation tracking (for security)
  parentJti: varchar("parent_jti", { length: 256 }),
  
  // Lifecycle
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jtiIdx: uniqueIndex("oauth_refresh_tokens_jti_unique").on(table.jti),
  userIdx: index("oauth_refresh_tokens_user_idx").on(table.userId),
}));

/**
 * User Consents - Tracks which scopes users granted to which clients
 */
export const oauthUserConsents = pgTable("oauth_user_consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: varchar("client_id", { length: 256 }).notNull(),
  
  // Granted scopes (space-separated)
  scope: text("scope").notNull(),
  
  // Lifecycle
  consentedAt: timestamp("consented_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => ({
  userClientIdx: uniqueIndex("oauth_user_consents_user_client_unique").on(table.userId, table.clientId),
}));

// ============================================
// PLATFORM CONNECTIONS (Zoom, Asana, etc.)
// ============================================

/**
 * Platform Connections - External service OAuth tokens
 * Stores tokens for Zoom, Teams, Asana, Jira, Gmail, Slack, etc.
 */
export const platformConnections = pgTable("platform_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Owner
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Platform identification
  platform: platformEnum("platform").notNull(),
  platformCategory: platformCategoryEnum("platform_category").notNull(),
  
  // Platform user info
  platformUserId: varchar("platform_user_id", { length: 256 }),
  platformEmail: varchar("platform_email", { length: 320 }),
  platformDisplayName: varchar("platform_display_name", { length: 256 }),
  
  // OAuth tokens (encrypted)
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenType: varchar("token_type", { length: 50 }).default("Bearer"),
  
  // Scopes granted
  scope: text("scope"),
  
  // Token lifecycle
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  
  // User preferences for this connection
  isDefault: boolean("is_default").default(false), // Default for this category
  isActive: boolean("is_active").default(true),
  
  // Connection metadata
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  
  // Platform-specific metadata (workspace info, etc.)
  metadata: jsonb("metadata").default({}),
}, (table) => ({
  userPlatformIdx: uniqueIndex("platform_connections_user_platform_unique").on(table.userId, table.platform),
  userIdx: index("platform_connections_user_idx").on(table.userId),
  platformIdx: index("platform_connections_platform_idx").on(table.platform),
}));

/**
 * Platform Destinations - Specific targets within platforms
 * E.g., Asana workspace/project, Jira project, Slack channel
 */
export const platformDestinations = pgTable("platform_destinations", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Parent connection
  connectionId: uuid("connection_id").notNull().references(() => platformConnections.id, { onDelete: "cascade" }),
  
  // Destination identification
  destinationType: varchar("destination_type", { length: 50 }).notNull(), // "workspace" | "project" | "board" | "channel" | etc.
  destinationId: varchar("destination_id", { length: 256 }).notNull(),
  destinationName: varchar("destination_name", { length: 256 }).notNull(),
  
  // Hierarchy (for nested structures like Asana workspace > project)
  parentDestinationId: uuid("parent_destination_id"),
  
  // User preferences
  isDefault: boolean("is_default").default(false),
  
  // Platform-specific metadata
  metadata: jsonb("metadata").default({}),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("platform_destinations_connection_idx").on(table.connectionId),
  destinationIdx: uniqueIndex("platform_destinations_unique").on(table.connectionId, table.destinationType, table.destinationId),
}));

// ============================================
// OAUTH FLOW STATE (temporary, for in-progress flows)
// ============================================

/**
 * OAuth States - Temporary state for OAuth flows
 * Used for PKCE and CSRF protection during platform OAuth
 */
export const oauthStates = pgTable("oauth_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  state: varchar("state", { length: 256 }).notNull(),
  
  // What we're connecting
  platform: platformEnum("platform").notNull(),
  
  // Who's connecting (may be null if not yet authenticated)
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  // PKCE
  codeVerifier: varchar("code_verifier", { length: 256 }).notNull(),
  
  // Where to redirect after completion
  redirectAfter: text("redirect_after"),
  
  // Additional context
  metadata: jsonb("metadata").default({}),
  
  // Lifecycle
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  stateIdx: uniqueIndex("oauth_states_state_unique").on(table.state),
  expiresIdx: index("oauth_states_expires_idx").on(table.expiresAt),
}));

// ============================================
// MEETINGS & CONTENT CACHE
// ============================================

/**
 * Meetings Cache - Cached meeting metadata
 */
export const meetingsCache = pgTable("meetings_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Owner and source
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  
  // Meeting identification
  platformMeetingId: varchar("platform_meeting_id", { length: 256 }).notNull(),
  
  // Meeting data
  title: varchar("title", { length: 512 }),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  
  // Participants
  participantCount: integer("participant_count"),
  participants: jsonb("participants").$type<{ name: string; email?: string }[]>(),
  
  // Recording/transcript availability
  hasRecording: boolean("has_recording").default(false),
  hasTranscript: boolean("has_transcript").default(false),
  
  // Platform-specific metadata
  metadata: jsonb("metadata").default({}),
  
  // Cache lifecycle
  cachedAt: timestamp("cached_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => ({
  userPlatformMeetingIdx: uniqueIndex("meetings_cache_unique").on(table.userId, table.platform, table.platformMeetingId),
  userIdx: index("meetings_cache_user_idx").on(table.userId),
  startTimeIdx: index("meetings_cache_start_time_idx").on(table.startTime),
}));

/**
 * Action Items - Extracted action items from meetings
 */
export const actionItems = pgTable("action_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Source
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  meetingCacheId: uuid("meeting_cache_id").references(() => meetingsCache.id, { onDelete: "set null" }),
  
  // Action item content
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  assignee: varchar("assignee", { length: 256 }),
  assigneeEmail: varchar("assignee_email", { length: 320 }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  priority: varchar("priority", { length: 20 }).default("medium"), // "high" | "medium" | "low"
  
  // Context from transcript
  context: text("context"),
  
  // Task creation tracking
  taskCreated: boolean("task_created").default(false),
  taskPlatform: platformEnum("task_platform"),
  taskExternalId: varchar("task_external_id", { length: 256 }),
  taskUrl: text("task_url"),
  
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // "pending" | "created" | "completed" | "dismissed"
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("action_items_user_idx").on(table.userId),
  meetingIdx: index("action_items_meeting_idx").on(table.meetingCacheId),
  statusIdx: index("action_items_status_idx").on(table.status),
}));

// ============================================
// AUDIT & COMPLIANCE
// ============================================

/**
 * Audit Log - Comprehensive activity logging
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  // Actor (may be null for system events)
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Event classification
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventCategory: varchar("event_category", { length: 50 }).notNull(), // "auth" | "data_access" | "write_action" | "settings" | "system"
  
  // Resource affected
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 256 }),
  
  // Event details
  description: text("description"),
  metadata: jsonb("metadata").default({}),
  
  // Request context
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  // Result
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  
  // Timestamp
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("audit_log_user_idx").on(table.userId),
  eventTypeIdx: index("audit_log_event_type_idx").on(table.eventType),
  createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
}));

// ============================================
// ENTERPRISE (Future-ready)
// ============================================

/**
 * Organizations - For enterprise customers
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  
  // Domain for SSO matching
  domain: varchar("domain", { length: 256 }),
  
  // SSO configuration
  ssoEnabled: boolean("sso_enabled").default(false),
  ssoProvider: varchar("sso_provider", { length: 50 }), // "okta" | "azure_ad" | "google" | etc.
  ssoConfig: jsonb("sso_config"),
  
  // Organization settings
  settings: jsonb("settings").default({}),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  slugIdx: uniqueIndex("organizations_slug_unique").on(table.slug),
  domainIdx: index("organizations_domain_idx").on(table.domain),
}));

// ============================================
// TYPE EXPORTS
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type PlatformConnection = typeof platformConnections.$inferSelect;
export type NewPlatformConnection = typeof platformConnections.$inferInsert;
export type PlatformDestination = typeof platformDestinations.$inferSelect;
export type MeetingCache = typeof meetingsCache.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Organization = typeof organizations.$inferSelect;

// Platform type from enum
export type Platform = typeof platformEnum.enumValues[number];
export type PlatformCategory = typeof platformCategoryEnum.enumValues[number];
