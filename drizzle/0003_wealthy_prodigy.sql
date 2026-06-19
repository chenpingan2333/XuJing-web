CREATE TYPE "public"."action_category" AS ENUM('auth', 'data', 'file', 'system');--> statement-breakpoint
CREATE TYPE "public"."action_result" AS ENUM('success', 'failure', 'denied');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'system', 'admin');--> statement-breakpoint
CREATE TYPE "public"."audit_target_type" AS ENUM('user', 'character', 'message', 'conversation', 'memory', 'order', 'vip_record', 'transaction', 'api_config', 'user_character_settings', 'file', 'system');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" DEFAULT 'user' NOT NULL,
	"actor_ip" varchar(45),
	"actor_ua" varchar(500),
	"action" varchar(50) NOT NULL,
	"action_category" "action_category" NOT NULL,
	"action_result" "action_result" DEFAULT 'success' NOT NULL,
	"error_message" text,
	"target_type" "audit_target_type" NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"target_name" varchar(255),
	"old_value" jsonb,
	"new_value" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"request_id" varchar(100),
	"request_method" varchar(10),
	"request_path" varchar(500),
	"retention_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs" USING btree ("actor_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target" ON "audit_logs" USING btree ("target_type","target_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_result" ON "audit_logs" USING btree ("action_result","created_at" desc) WHERE "audit_logs"."action_result" IN ('failure', 'denied');--> statement-breakpoint
CREATE INDEX "idx_audit_logs_category" ON "audit_logs" USING btree ("action_category","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_metadata" ON "audit_logs" USING gin ("metadata") WHERE "audit_logs"."metadata" IS NOT NULL AND "audit_logs"."metadata" != '{}';--> statement-breakpoint
CREATE INDEX "idx_audit_logs_request_id" ON "audit_logs" USING btree ("request_id") WHERE "audit_logs"."request_id" IS NOT NULL;