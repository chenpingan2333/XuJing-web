/**
 * 全局常量
 */

/** 验证码相关 */
export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_TTL_SEC = 300;        // 5 分钟
export const VERIFICATION_CODE_DAILY_LIMIT = 10;     // 每日发送上限

/** 普通用户限制 */
export const NORMAL_CHARACTER_LIMIT = 2;
export const NORMAL_MEMORY_LIMIT = 100;

/** VIP 用户限制 */
export const VIP_MEMORY_LIMIT = 10000;

/** 聊天 */
export const CONTEXT_MESSAGE_LIMIT = 30;
export const MEMORY_RETRIEVAL_LIMIT = 10;

/** 星钻汇率 */
export const STAR_DIAMOND_RATE = 100; // 1 元 = 100 星钻

/** API 测试连接超时 */
export const API_TEST_TIMEOUT_MS = 10_000;
