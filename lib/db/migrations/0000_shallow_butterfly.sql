CREATE TYPE "public"."platform_category" AS ENUM('meetings', 'tasks', 'email', 'communication');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('zoom', 'teams', 'meet', 'webex', 'asana', 'jira', 'notion', 'linear', 'trello', 'monday', 'slack', 'gmail', 'outlook');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meeting_cache_id" uuid,
	"title" varchar(512) NOT NULL,
	"description" text,
	"assignee" varchar(256),
	"assignee_email" varchar(320),
	"due_date" timestamp with time zone,
	"priority" varchar(20) DEFAULT 'medium',
	"context" text,
	"task_created" boolean DEFAULT false,
	"task_platform" "platform",
	"task_external_id" varchar(256),
	"task_url" text,
	"status" varchar(50) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"event_category" varchar(50) NOT NULL,
	"resource_type" varchar(100),
	"resource_id" varchar(256),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"success" boolean DEFAULT true,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_meeting_id" varchar(256) NOT NULL,
	"title" varchar(512),
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"duration_minutes" integer,
	"participant_count" integer,
	"participants" jsonb,
	"has_recording" boolean DEFAULT false,
	"has_transcript" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti" varchar(256) NOT NULL,
	"client_id" varchar(256) NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(256) NOT NULL,
	"client_id" varchar(256) NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" varchar(256) NOT NULL,
	"code_challenge_method" varchar(10) DEFAULT 'S256' NOT NULL,
	"nonce" varchar(256),
	"state" varchar(256),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(256) NOT NULL,
	"client_secret" text,
	"client_name" varchar(256) NOT NULL,
	"client_description" text,
	"client_uri" text,
	"logo_uri" text,
	"redirect_uris" jsonb NOT NULL,
	"allowed_origins" jsonb,
	"client_type" varchar(50) DEFAULT 'confidential' NOT NULL,
	"grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
	"response_types" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
	"allowed_scopes" text DEFAULT 'openid profile email meetings:read meetings:summary tasks:write' NOT NULL,
	"registration_access_token" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti" varchar(256) NOT NULL,
	"client_id" varchar(256) NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"parent_jti" varchar(256),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" varchar(256) NOT NULL,
	"platform" "platform" NOT NULL,
	"user_id" uuid,
	"code_verifier" varchar(256) NOT NULL,
	"redirect_after" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" varchar(256) NOT NULL,
	"scope" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"domain" varchar(256),
	"sso_enabled" boolean DEFAULT false,
	"sso_provider" varchar(50),
	"sso_config" jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_category" "platform_category" NOT NULL,
	"platform_user_id" varchar(256),
	"platform_email" varchar(320),
	"platform_display_name" varchar(256),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_type" varchar(50) DEFAULT 'Bearer',
	"scope" text,
	"expires_at" timestamp with time zone,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"destination_type" varchar(50) NOT NULL,
	"destination_id" varchar(256) NOT NULL,
	"destination_name" varchar(256) NOT NULL,
	"parent_destination_id" uuid,
	"is_default" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_meeting_platform" "platform",
	"auto_summarize" boolean DEFAULT false,
	"summary_language" varchar(10) DEFAULT 'en',
	"default_task_platform" "platform",
	"auto_create_tasks" boolean DEFAULT false,
	"default_email_tone" varchar(50) DEFAULT 'professional',
	"email_signature" text,
	"summary_style" varchar(50) DEFAULT 'concise',
	"include_action_items" boolean DEFAULT true,
	"include_key_decisions" boolean DEFAULT true,
	"retain_transcripts_hours" integer DEFAULT 0,
	"allow_analytics" boolean DEFAULT true,
	"timezone" varchar(64) DEFAULT 'America/Chicago',
	"additional_settings" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"name" varchar(256),
	"avatar_url" text,
	"google_id" varchar(256),
	"microsoft_id" varchar(256),
	"is_active" boolean DEFAULT true,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_cache_id_meetings_cache_id_fk" FOREIGN KEY ("meeting_cache_id") REFERENCES "public"."meetings_cache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings_cache" ADD CONSTRAINT "meetings_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_user_consents" ADD CONSTRAINT "oauth_user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_destinations" ADD CONSTRAINT "platform_destinations_connection_id_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_user_idx" ON "action_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "action_items_meeting_idx" ON "action_items" USING btree ("meeting_cache_id");--> statement-breakpoint
CREATE INDEX "action_items_status_idx" ON "action_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_event_type_idx" ON "audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_cache_unique" ON "meetings_cache" USING btree ("user_id","platform","platform_meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_cache_user_idx" ON "meetings_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_cache_start_time_idx" ON "meetings_cache" USING btree ("start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_access_tokens_jti_unique" ON "oauth_access_tokens" USING btree ("jti");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_idx" ON "oauth_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_authorization_codes_code_unique" ON "oauth_authorization_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "oauth_authorization_codes_expires_idx" ON "oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_unique" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_refresh_tokens_jti_unique" ON "oauth_refresh_tokens" USING btree ("jti");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_idx" ON "oauth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_states_state_unique" ON "oauth_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_user_consents_user_client_unique" ON "oauth_user_consents" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_domain_idx" ON "organizations" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_connections_user_platform_unique" ON "platform_connections" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "platform_connections_user_idx" ON "platform_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_connections_platform_idx" ON "platform_connections" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "platform_destinations_connection_idx" ON "platform_destinations" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_destinations_unique" ON "platform_destinations" USING btree ("connection_id","destination_type","destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_google_id_idx" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "users_microsoft_id_idx" ON "users" USING btree ("microsoft_id");