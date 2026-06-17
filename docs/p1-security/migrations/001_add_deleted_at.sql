-- ============================================================
-- P1 安全边界建设：软删除迁移
-- 日期：2026-06-17
-- 描述：为 5 张核心业务表添加 deleted_at 字段及部分索引
--       characters 表已有 deleted_at，无需重复添加
-- ============================================================

BEGIN;

-- ─── 1. users 表 ────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.deleted_at IS '软删除时间戳，NULL 表示未删除';

-- ─── 2. memories 表 ─────────────────────────────────────
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_memories_active
  ON memories (character_id, user_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN memories.deleted_at IS '软删除时间戳，NULL 表示未删除';

-- ─── 3. conversations 表 ────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversations_active
  ON conversations (user_id, character_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN conversations.deleted_at IS '软删除时间戳，NULL 表示未删除';

-- ─── 4. messages 表 ─────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_messages_active
  ON messages (character_id, user_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN messages.deleted_at IS '软删除时间戳，NULL 表示未删除';

-- ─── 5. user_character_settings 表 ──────────────────────
ALTER TABLE user_character_settings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_user_character_settings_active
  ON user_character_settings (user_id, character_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN user_character_settings.deleted_at IS '软删除时间戳，NULL 表示未删除';

-- ─── 6. api_configs 表 ──────────────────────────────────
ALTER TABLE api_configs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_api_configs_active
  ON api_configs (user_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN api_configs.deleted_at IS '软删除时间戳，NULL 表示未删除';

COMMIT;
