-- Custom enum types (generated from src/db/enums.ts)
CREATE TYPE "admin_action_type" AS ENUM ('USER_CREATE', 'USER_BAN', 'USER_UNBAN', 'CHARACTER_UNLIST', 'ORDER_APPROVE', 'ORDER_REJECT', 'VIP_GRANT', 'VIP_REVOKE');
CREATE TYPE "admin_target_type" AS ENUM ('USER', 'CHARACTER', 'ORDER', 'VIP');
CREATE TYPE "api_platform" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'DEEPSEEK', 'GROK', 'CUSTOM_OPENAI', 'CUSTOM_ANTHROPIC', 'CUSTOM_GEMINI');
CREATE TYPE "memory_category" AS ENUM ('FACT', 'PREFERENCE', 'EVENT');
CREATE TYPE "message_role" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "order_status" AS ENUM ('PENDING_PAYMENT', 'PENDING_REVIEW', 'COMPLETED', 'REJECTED');
CREATE TYPE "transaction_type" AS ENUM ('RECHARGE', 'VIP_PURCHASE', 'CHAT_CONSUME', 'ADMIN_ADJUST');
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'BANNED');
CREATE TYPE "vip_plan_type" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TABLE "admin_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action_type" "admin_action_type" NOT NULL,
	"target_type" "admin_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"detail" jsonb,
	"request_id" uuid,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"platform" "api_platform" NOT NULL,
	"api_url" varchar(500) NOT NULL,
	"api_key_encrypted" varchar(500) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" varchar(100) NOT NULL,
	"avatar_url" varchar(500),
	"background_url" varchar(500),
	"setting" text NOT NULL,
	"greeting" text NOT NULL,
	"personality" text,
	"scenario" text,
	"dialogue_examples" jsonb,
	"nickname" varchar(100),
	"group_greeting" text,
	"main_prompt" text,
	"post_history_instructions" text,
	"extra_fields" jsonb,
	"is_official" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"importance" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"extracted_from_message_id" uuid,
	"embedding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_rmb" numeric(10, 2) NOT NULL,
	"star_diamonds" bigint NOT NULL,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"screenshot_url" varchar(500),
	"review_note" varchar(500),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"transaction_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_diamond_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"type" "transaction_type" NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"nickname" varchar(100) DEFAULT '',
	"avatar_url" varchar(500),
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"vip_expires_at" timestamp with time zone,
	"star_diamonds" bigint DEFAULT 0 NOT NULL,
	"persona_setting" text,
	"has_purchased_vip" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_type" "vip_plan_type" NOT NULL,
	"star_diamonds_spent" bigint NOT NULL,
	"is_first_purchase" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_configs" ADD CONSTRAINT "api_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_diamond_transactions" ADD CONSTRAINT "star_diamond_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_records" ADD CONSTRAINT "vip_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_logs_admin_created" ON "admin_logs" USING btree ("admin_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_admin_logs_action_type" ON "admin_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_admin_logs_request_id" ON "admin_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_api_configs_user_id" ON "api_configs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_configs_user_default" ON "api_configs" USING btree ("user_id") WHERE "api_configs"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_characters_user_id" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_characters_is_official" ON "characters" USING btree ("is_official");--> statement-breakpoint
CREATE INDEX "idx_characters_active" ON "characters" USING btree ("user_id") WHERE "characters"."deleted_at" IS NULL AND "characters"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_memories_char_user" ON "memories" USING btree ("character_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_memories_importance" ON "memories" USING btree ("importance" desc);--> statement-breakpoint
CREATE INDEX "idx_memories_char_user_importance" ON "memories" USING btree ("character_id","user_id","importance" desc);--> statement-breakpoint
CREATE INDEX "idx_messages_char_created" ON "messages" USING btree ("character_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_messages_user_char" ON "messages" USING btree ("user_id","character_id");--> statement-breakpoint
CREATE INDEX "idx_messages_user_char_created" ON "messages" USING btree ("user_id","character_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_orders_user_id" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_transaction_id_unique" ON "orders" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status_created" ON "orders" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_orders_pending_review" ON "orders" USING btree ("status","created_at" desc) WHERE "orders"."status" = 'PENDING_REVIEW';--> statement-breakpoint
CREATE INDEX "idx_sdt_user_created" ON "star_diamond_transactions" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_sdt_type" ON "star_diamond_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_sdt_reference_id" ON "star_diamond_transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_vip_records_user_id" ON "vip_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vip_records_expires_at" ON "vip_records" USING btree ("expires_at");