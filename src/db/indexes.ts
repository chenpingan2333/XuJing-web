/**
 * 叙境（Xujing）Indexes 参考文档
 *
 * 所有索引已内联至各 schema 文件的 pgTable 第三参数，
 * drizzle-kit generate / migrate 自动处理。
 *
 * 本文件仅供人工查阅，不参与构建。
 *
 * email 小写策略：
 *   应用层 email.trim().toLowerCase() + 数据库 UNIQUE(email)
 *   无需 CHECK 约束。
 *
 * ═══════════════════════════════════════════════════
 * 索引清单（24 个，全部由 drizzle-kit 自动生成）
 * ═══════════════════════════════════════════════════
 *
 * users
 *   ✅ idx_users_email_unique          UNIQUE(email)
 *
 * characters
 *   ✅ idx_characters_user_id           INDEX(user_id)
 *   ✅ idx_characters_is_official       INDEX(is_official)
 *   ✅ idx_characters_active            INDEX(user_id) WHERE deleted_at IS NULL AND user_id IS NOT NULL  [PARTIAL]
 *
 * messages
 *   ✅ idx_messages_char_created        INDEX(character_id, created_at DESC)
 *   ✅ idx_messages_user_char           INDEX(user_id, character_id)
 *   ✅ idx_messages_user_char_created   INDEX(user_id, character_id, created_at DESC)  [COMPOSITE]
 *
 * memories
 *   ✅ idx_memories_char_user           INDEX(character_id, user_id)
 *   ✅ idx_memories_importance          INDEX(importance DESC)
 *   ✅ idx_memories_char_user_importance INDEX(character_id, user_id, importance DESC)  [COMPOSITE]
 *
 * api_configs
 *   ✅ idx_api_configs_user_id          INDEX(user_id)
 *   ✅ idx_api_configs_user_default     UNIQUE(user_id) WHERE is_default = TRUE  [PARTIAL UNIQUE]
 *
 * orders
 *   ✅ idx_orders_user_id               INDEX(user_id)
 *   ✅ idx_orders_status                INDEX(status)
 *   ✅ idx_orders_transaction_id_unique UNIQUE(transaction_id)
 *   ✅ idx_orders_status_created        INDEX(status, created_at DESC)  [COMPOSITE]
 *   ✅ idx_orders_pending_review        INDEX(status, created_at DESC) WHERE status = 'PENDING_REVIEW'  [PARTIAL]
 *
 * vip_records
 *   ✅ idx_vip_records_user_id          INDEX(user_id)
 *   ✅ idx_vip_records_expires_at       INDEX(expires_at)
 *
 * admin_logs
 *   ✅ idx_admin_logs_admin_created     INDEX(admin_id, created_at DESC)
 *   ✅ idx_admin_logs_action_type       INDEX(action_type)
 *   ✅ idx_admin_logs_request_id        INDEX(request_id)
 *
 * star_diamond_transactions
 *   ✅ idx_sdt_user_created             INDEX(user_id, created_at DESC)
 *   ✅ idx_sdt_type                     INDEX(type)
 *   ✅ idx_sdt_reference_id             INDEX(reference_id)
 */
export {};