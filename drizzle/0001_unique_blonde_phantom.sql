CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "category" "memory_category" DEFAULT 'FACT' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "reference_ids" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "uid" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversations_user_char" ON "conversations" USING btree ("user_id","character_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_updated" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_memories_category" ON "memories" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_uid_unique" ON "users" USING btree ("uid");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_uid_unique" UNIQUE("uid");