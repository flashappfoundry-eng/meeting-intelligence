ALTER TABLE "oauth_tokens" ADD COLUMN IF NOT EXISTS "provider_user_id" varchar(256);
--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN IF NOT EXISTS "provider_email" varchar(320);


