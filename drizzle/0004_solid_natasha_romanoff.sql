CREATE TABLE "character_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_follows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"character_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_configs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "one_line_intro" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "publicity_fields" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "fake_chats" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "fake_likes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_character_settings" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "character_comments" ADD CONSTRAINT "character_comments_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_comments" ADD CONSTRAINT "character_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_character_comments_character" ON "character_comments" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "idx_character_comments_user" ON "character_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_character_comments_active" ON "character_comments" USING btree ("character_id") WHERE "character_comments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_follows_unique" ON "user_follows" USING btree ("follower_id","following_id","character_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_follower" ON "user_follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_following" ON "user_follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "idx_user_follows_character" ON "user_follows" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "idx_api_configs_active" ON "api_configs" USING btree ("user_id") WHERE "api_configs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_characters_is_public" ON "characters" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_characters_public_active" ON "characters" USING btree ("is_public","is_official") WHERE "characters"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_conversations_active" ON "conversations" USING btree ("id") WHERE "conversations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_memories_active" ON "memories" USING btree ("id") WHERE "memories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_messages_active" ON "messages" USING btree ("id") WHERE "messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_user_character_settings_active" ON "user_character_settings" USING btree ("id") WHERE "user_character_settings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_users_active" ON "users" USING btree ("id") WHERE "users"."deleted_at" IS NULL;