CREATE TABLE IF NOT EXISTS "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meeting_cache_id" uuid,
	"provider" varchar(64),
	"external_id" varchar(256),
	"text" text NOT NULL,
	"assignee" varchar(256),
	"due_at" timestamp with time zone,
	"completed" boolean DEFAULT false NOT NULL,
	"priority" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(128),
	"entity_id" varchar(256),
	"message" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meetings_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"meeting_id" varchar(256) NOT NULL,
	"title" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" varchar(256) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"user_id" uuid,
	"redirect_uri" text,
	"code_verifier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" varchar(32),
	"scope" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.action_items') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_items_user_id_users_id_fk') THEN
      ALTER TABLE "action_items" ADD CONSTRAINT "action_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.action_items') IS NOT NULL AND to_regclass('public.meetings_cache') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_items_meeting_cache_id_meetings_cache_id_fk') THEN
      ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_cache_id_meetings_cache_id_fk" FOREIGN KEY ("meeting_cache_id") REFERENCES "public"."meetings_cache"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_user_id_users_id_fk') THEN
      ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.meetings_cache') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_cache_user_id_users_id_fk') THEN
      ALTER TABLE "meetings_cache" ADD CONSTRAINT "meetings_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.oauth_states') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_states_user_id_users_id_fk') THEN
      ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.oauth_tokens') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_tokens_user_id_users_id_fk') THEN
      ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_items_user_id_idx" ON "action_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_items_meeting_cache_id_idx" ON "action_items" USING btree ("meeting_cache_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_items_provider_external_id_idx" ON "action_items" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meetings_cache_user_provider_meeting_unique" ON "meetings_cache" USING btree ("user_id","provider","meeting_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_cache_user_id_idx" ON "meetings_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_cache_provider_meeting_id_idx" ON "meetings_cache" USING btree ("provider","meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_unique" ON "oauth_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_provider_state_idx" ON "oauth_states" USING btree ("provider","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_user_id_idx" ON "oauth_states" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_tokens_user_provider_unique" ON "oauth_tokens" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_user_id_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_tokens_provider_idx" ON "oauth_tokens" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");