import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * users
 * - Application users (ChatGPT app users / internal identities).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
  }),
);

/**
 * oauth_tokens
 * - Stored OAuth tokens for external providers (e.g., Zoom, Asana).
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 256 }),
    providerEmail: varchar("provider_email", { length: 320 }),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenType: varchar("token_type", { length: 32 }),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userProviderUnique: uniqueIndex("oauth_tokens_user_provider_unique").on(
      t.userId,
      t.provider,
    ),
    userIdx: index("oauth_tokens_user_id_idx").on(t.userId),
    providerIdx: index("oauth_tokens_provider_idx").on(t.provider),
  }),
);

/**
 * oauth_states
 * - OAuth state/PKCE records for completing authorization code flows safely.
 */
export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    state: varchar("state", { length: 256 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri"),
    codeVerifier: text("code_verifier"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => ({
    stateUnique: uniqueIndex("oauth_states_state_unique").on(t.state),
    providerStateIdx: index("oauth_states_provider_state_idx").on(
      t.provider,
      t.state,
    ),
    userIdx: index("oauth_states_user_id_idx").on(t.userId),
  }),
);

/**
 * meetings_cache
 * - Cached meeting metadata and/or summaries keyed by provider meeting id.
 */
export const meetingsCache = pgTable(
  "meetings_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    meetingId: varchar("meeting_id", { length: 256 }).notNull(),
    title: text("title"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}).notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userProviderMeetingUnique: uniqueIndex(
      "meetings_cache_user_provider_meeting_unique",
    ).on(t.userId, t.provider, t.meetingId),
    userIdx: index("meetings_cache_user_id_idx").on(t.userId),
    providerMeetingIdx: index("meetings_cache_provider_meeting_id_idx").on(
      t.provider,
      t.meetingId,
    ),
  }),
);

/**
 * action_items
 * - Action items extracted from meetings (or created by the app), optionally tied to external task systems.
 */
export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    meetingCacheId: uuid("meeting_cache_id").references(() => meetingsCache.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 64 }),
    externalId: varchar("external_id", { length: 256 }),
    text: text("text").notNull(),
    assignee: varchar("assignee", { length: 256 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completed: boolean("completed").default(false).notNull(),
    priority: integer("priority"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdx: index("action_items_user_id_idx").on(t.userId),
    meetingIdx: index("action_items_meeting_cache_id_idx").on(t.meetingCacheId),
    providerExternalIdx: index("action_items_provider_external_id_idx").on(
      t.provider,
      t.externalId,
    ),
  }),
);

/**
 * audit_log
 * - Lightweight audit trail for later expansion.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 128 }),
    entityId: varchar("entity_id", { length: 256 }),
    message: text("message"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdx: index("audit_log_user_id_idx").on(t.userId),
    actionIdx: index("audit_log_action_idx").on(t.action),
  }),
);



