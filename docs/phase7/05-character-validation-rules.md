# 05 — Character Validation Rules

> **Phase 7 Design Freeze** | **Updated**: 2026-06-08
> **Companion**: [01-character-architecture.md](./01-character-architecture.md), [03-character-page-design.md](./03-character-page-design.md)

---

## 1. Validation Architecture

### 1.1 Location

`src/app/api/characters/validations.ts` — single source of truth for all character CRUD validation.

### 1.2 Validation Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Client | Zod schemas shared via `@/validations` barrel | Form-field highlighting, save-disable logic |
| Server | `z.parse()` in route handlers | Request-body validation, 400 responses |
| Business | Service-layer checks | Quota, ownership, duplicate names, immutability |

### 1.3 Error Response Shape

```json
{ "error": "VALIDATION_ERROR", "message": "角色名称不能为空", "fields": { "name": "角色名称不能为空" } }
```

### 1.4 Design Principle

| Category | Max Length | Fields |
|----------|------------|--------|
| User-facing short text | 10–500 | name (10), nickname (10), greeting (200), group_greeting (200), dialogue_examples (500) |
| Long-form content | 10000 | setting, personality, scenario, main_prompt, post_history_instructions |
| URL fields | 500 | avatar_url, background_url |

> Rationale: prevent users from creating excessively long opening messages or dialogue examples that waste tokens while allowing rich character definitions.

---

## 2. Zod Schema Definitions

All schemas are in `src/app/api/characters/validations.ts`.

### 2.1 CreateCharacterSchema

```typescript
import { z } from "zod";

export const CreateCharacterSchema = z.object({
  name: z.string()
    .min(1, "角色名称不能为空")
    .max(10, "角色名称最长 10 个中文字符")
    .trim(),

  setting: z.string()
    .min(1, "角色设定不能为空")
    .max(10000, "角色设定最长 10000 字"),

  greeting: z.string()
    .min(1, "开场白不能为空")
    .max(200, "开场白最长 200 字"),

  avatar_url: z.string()
    .url("头像 URL 格式无效")
    .max(500, "头像 URL 最长 500 个字符")
    .optional()
    .or(z.literal("")),

  background_url: z.string()
    .url("背景图 URL 格式无效")
    .max(500, "背景图 URL 最长 500 个字符")
    .optional()
    .or(z.literal("")),

  personality: z.string()
    .max(10000, "性格特点最长 10000 字")
    .optional()
    .or(z.literal("")),

  scenario: z.string()
    .max(10000, "情景设定最长 10000 字")
    .optional()
    .or(z.literal("")),

  dialogue_examples: z.string()
    .max(500, "对话示例最长 500 字")
    .optional()
    .or(z.literal("")),

  nickname: z.string()
    .max(10, "昵称最长 10 个中文字符")
    .optional()
    .or(z.literal("")),

  group_greeting: z.string()
    .max(200, "群聊开场白最长 200 字")
    .optional()
    .or(z.literal("")),

  main_prompt: z.string()
    .max(10000, "主要提示最长 10000 字")
    .optional()
    .or(z.literal("")),

  post_history_instructions: z.string()
    .max(10000, "历史后指令最长 10000 字")
    .optional()
    .or(z.literal("")),

  extra_fields: z.record(z.unknown()).optional(),
});

export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;
```

### 2.2 UpdateCharacterSchema

All fields are optional. When a field is omitted, it is left unchanged.

```typescript
export const UpdateCharacterSchema = z.object({
  name: z.string().min(1).max(10).trim().optional(),
  setting: z.string().min(1).max(10000).optional(),
  greeting: z.string().min(1).max(200).optional(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  background_url: z.string().url().max(500).optional().nullable(),
  personality: z.string().max(10000).optional().nullable(),
  scenario: z.string().max(10000).optional().nullable(),
  dialogue_examples: z.string().max(500).optional().nullable(),
  nickname: z.string().max(10).optional().nullable(),
  group_greeting: z.string().max(200).optional().nullable(),
  main_prompt: z.string().max(10000).optional().nullable(),
  post_history_instructions: z.string().max(10000).optional().nullable(),
  extra_fields: z.record(z.unknown()).optional().nullable(),
});

export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;
```

### 2.3 Import Schemas

**Xujing native:**

```typescript
export const ImportXujingCharacterSchema = z.object({
  name: z.string().min(1).max(10).trim(),
  setting: z.string().min(1).max(10000),
  greeting: z.string().min(1).max(200),
  avatar_url: z.string().url().max(500).optional().or(z.literal("")),
  background_url: z.string().url().max(500).optional().or(z.literal("")),
  personality: z.string().max(10000).optional().or(z.literal("")),
  scenario: z.string().max(10000).optional().or(z.literal("")),
  dialogue_examples: z.string().max(500).optional().or(z.literal("")),
  nickname: z.string().max(10).optional().or(z.literal("")),
  group_greeting: z.string().max(200).optional().or(z.literal("")),
  main_prompt: z.string().max(10000).optional().or(z.literal("")),
  post_history_instructions: z.string().max(10000).optional().or(z.literal("")),
  extra_fields: z.record(z.unknown()).optional(),
  exported_at: z.string().optional(),
  exported_version: z.number().optional(),
  source: z.string().optional(),
});
```

**Tavern Card v2:**

```typescript
export const ImportTavernCharacterSchema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.literal("2.0"),
  data: z.object({
    name: z.string().min(1).max(10),
    description: z.string().min(1).max(10000),
    first_mes: z.string().min(1).max(200),
    personality: z.string().max(10000).optional(),
    scenario: z.string().max(10000).optional(),
    mes_example: z.string().max(500).optional(),
    creator_notes: z.string().max(10000).optional(),
    system_prompt: z.string().max(10000).optional(),
    post_history_instructions: z.string().max(10000).optional(),
    alternate_greetings: z.array(z.string()).optional(),
    character_version: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const ImportCharacterSchema = z.union([
  ImportXujingCharacterSchema,
  ImportTavernCharacterSchema,
]);
```

---

## 3. Field-Level Validation Rules

### 3.1 name — 角色名称

| Rule | Value |
|------|-------|
| Required | YES |
| Min length | 1 (after trim) |
| Max length | 10 Chinese characters |
| Trim | YES — leading/trailing whitespace stripped |
| No blank-only | Whitespace-only strings rejected by Zod `.min(1)` after `.trim()` |
| Uniqueness | Per-user case-insensitive check at service layer (not Zod) |
| UI counter | 0 / 10 |

### 3.2 setting — 角色设定

| Rule | Value |
|------|-------|
| Required | YES |
| Max length | 10,000 chars |
| Markdown | Supported for content formatting |
| No blank | Empty or whitespace-only rejected |
| UI counter | 0 / 10000 |

### 3.3 greeting — 开场白

| Rule | Value |
|------|-------|
| Required | YES |
| Max length | 200 chars |
| Multi-section | Separate with `<START>` — max 5 sections |
| Valid check | Each `<START>`-delimited section must be non-empty after trim |
| UI counter | 0 / 200 |

```typescript
function validateGreetingSegments(greeting: string): string[] {
  const parts = greeting.split("<START>");
  const trimmed = parts.map(p => p.trim()).filter(Boolean);
  if (trimmed.length === 0 || trimmed.length > 5) {
    throw new ValidationError("VALIDATION_ERROR", "开场白段落数量不合法（1-5 个）");
  }
  return trimmed;
}
```

### 3.4 avatar_url / background_url

| Rule | Value |
|------|-------|
| Required | NO |
| Max length | 500 chars |
| Format | Valid http/https URL |
| Empty string | Accepted as "no image" |

> Upload size/format validation (10 MB, jpg/png/webp) is enforced at the upload endpoint, not here.

### 3.5 Text Fields — personality, scenario, main_prompt, post_history_instructions

| Rule | Value |
|------|-------|
| Required | NO |
| Max length | 10,000 chars each |
| `{{original}}` | Reserved token in main_prompt / post_history_instructions — inserts default system prompt |
| UI counter | 0 / 10000 |

### 3.6 dialogue_examples — 对话示例

| Rule | Value |
|------|-------|
| Required | NO |
| Type | String (plain text) |
| Max length | 500 chars |
| Format | Tavern format: `{{char}}: ...\n{{user}}: ...` |
| Multi-turn | Separate with blank lines between pairs |
| UI counter | 0 / 500 |

> Stored as-is in the `dialogue_examples` text field. Parsing into structured turns happens at prompt construction time, not at validation time.

### 3.7 nickname — 昵称

| Rule | Value |
|------|-------|
| Required | NO |
| Max length | 10 Chinese characters |
| UI counter | 0 / 10 |

### 3.8 group_greeting — 群聊开场白

| Rule | Value |
|------|-------|
| Required | NO |
| Max length | 200 chars |
| Runtime role | **Stored only** — not connected to chat system, not part of prompt, not used in any runtime logic |
| UI counter | 0 / 200 |

### 3.9 extra_fields

| Rule | Value |
|------|-------|
| Required | NO |
| Type | JSON object |
| Max top-level keys | 50 |
| Max nesting depth | 3 levels |

---

## 4. Business Validation (Service Layer)

### 4.1 Quota Check

```typescript
const FREE_USER_CHARACTER_LIMIT = 12;

async function checkCharacterQuota(userId: string, plan: "FREE" | "VIP"): Promise<void> {
  if (plan === "VIP") return; // Unlimited
  const count = await characterRepo.countUserCharacters(userId);
  if (count >= FREE_USER_CHARACTER_LIMIT) {
    throw new BusinessError("CHARACTER_QUOTA_EXCEEDED", "角色数量已达上限 (12/12)");
  }
}
```

### 4.2 Ownership & Immutability

```typescript
async function requireCharacterOwnership(
  characterId: string,
  userId: string,
): Promise<Character> {
  const character = await characterRepo.findById(characterId);
  if (!character) {
    throw new BusinessError("CHARACTER_NOT_FOUND", "角色不存在");
  }
  if (character.deletedAt) {
    throw new BusinessError("CHARACTER_NOT_FOUND", "角色已删除");
  }
  if (character.userId !== userId) {
    throw new BusinessError("CHARACTER_NOT_OWNED", "无权操作此角色");
  }
  if (character.isOfficial) {
    throw new BusinessError("CHARACTER_OFFICIAL_IMMUTABLE", "官方角色不可编辑或删除");
  }
  return character;
}
```

### 4.3 Duplicate Name

```typescript
async function checkDuplicateName(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const trimmed = name.trim();
  const existing = await characterRepo.findByUserIdAndNamePattern(userId, trimmed);
  if (existing && existing.id !== excludeId) {
    throw new BusinessError("CHARACTER_DUPLICATE_NAME", "已存在同名角色「" + trimmed + "」");
  }
}
```

### 4.4 Import Size Limit

```typescript
const IMPORT_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function validateImportSize(jsonString: string): void {
  if (Buffer.byteLength(jsonString, "utf-8") > IMPORT_MAX_PAYLOAD_BYTES) {
    throw new BusinessError("CHARACTER_IMPORT_TOO_LARGE", "导入文件过大（最大 5 MB）");
  }
}
```

---

## 5. Security Validation

### 5.1 XSS Prevention

| Field | Strategy |
|-------|----------|
| name, nickname | Strip all HTML tags on input; output-encode on render |
| All text fields | Store as plain text; render Markdown -> sanitize HTML -> output |

> Text fields support Markdown. Rendering pipeline:
> 1. Parse Markdown to HTML (marked/remark)
> 2. Sanitize HTML with DOMPurify — allow: p, br, strong, em, a, code, pre, ul, ol, li, blockquote, h1-h6
> 3. Block: script, style, iframe, object, embed, on* attributes

### 5.2 SQL Injection

> All database access uses Drizzle ORM with parameterized queries. No raw SQL string concatenation.

### 5.3 Rate Limiting

| Endpoint | FREE | VIP |
|----------|------|-----|
| POST /api/characters | 5/min | 20/min |
| PUT /api/characters/:id | 10/min | 30/min |
| DELETE /api/characters/:id | 5/min | 10/min |
| POST /api/characters/import | 3/min | 10/min |

### 5.4 Authorization Matrix

| Operation | FREE | VIP | Target: Official | Target: Own |
|-----------|------|-----|------------------|-------------|
| List official | YES | YES | — | — |
| List own | YES | YES | — | — |
| Create | YES (quota) | YES | — | — |
| Edit | YES | YES | DENY | YES |
| Delete | YES | YES | DENY | YES |
| Export | YES | YES | DENY | YES |
| Import | YES (quota) | YES | — | — |

---

## 6. Export Format

### 6.1 Xujing Character Card JSON

```typescript
interface CharacterExport {
  name: string;
  setting: string;
  greeting: string;
  avatar_url?: string | null;
  background_url?: string | null;
  personality?: string | null;
  scenario?: string | null;
  dialogue_examples?: string | null;
  nickname?: string | null;
  group_greeting?: string | null;
  main_prompt?: string | null;
  post_history_instructions?: string | null;
  extra_fields?: Record<string, unknown> | null;
  // Metadata inserted at export time
  exported_at: string;    // ISO 8601
  exported_version: 1;
  source: "xujing";
}
```

**Excluded from export:** id, userId, isOfficial, deletedAt, createdAt, updatedAt, version.

### 6.2 Export Zod Schema

```typescript
export const ExportCharacterSchema = z.object({
  name: z.string(),
  setting: z.string(),
  greeting: z.string(),
  avatar_url: z.string().nullable().optional(),
  background_url: z.string().nullable().optional(),
  personality: z.string().nullable().optional(),
  scenario: z.string().nullable().optional(),
  dialogue_examples: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  group_greeting: z.string().nullable().optional(),
  main_prompt: z.string().nullable().optional(),
  post_history_instructions: z.string().nullable().optional(),
  extra_fields: z.record(z.unknown()).nullable().optional(),
  exported_at: z.string(),
  exported_version: z.literal(1),
  source: z.literal("xujing"),
});
```

---

## 7. Import Format Detection

### 7.1 Detection Logic

```typescript
type ImportFormat = "xujing" | "tavern_v2" | null;

function detectImportFormat(json: unknown): ImportFormat {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  if (obj.source === "xujing") return "xujing";
  if (obj.spec === "chara_card_v2") return "tavern_v2";

  // Legacy Tavern v1 fallback: top-level "data" with "name"
  if (obj.data && typeof obj.data === "object" && "name" in (obj.data as object)) {
    return "tavern_v2";
  }

  return null;
}
```

### 7.2 Tavern -> Xujing Field Mapping

| Tavern Field | Xujing Field |
|-------------|-------------|
| data.name | name |
| data.description | setting |
| data.first_mes | greeting |
| data.personality | personality |
| data.scenario | scenario |
| data.mes_example | dialogue_examples (stored as string) |
| data.system_prompt | main_prompt |
| data.post_history_instructions | post_history_instructions |
| data.creator_notes | extra_fields.creatorNotes |
| data.alternate_greetings | extra_fields.alternateGreetings |
| data.tags | extra_fields.tags |

> Tavern `mes_example` is preserved as-is. No parsing into structured turns at import time.

---

## 8. Error Codes Reference

| Code | HTTP | Message |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | 请求参数验证失败，详见 fields |
| `CHARACTER_NOT_FOUND` | 404 | 角色不存在 |
| `CHARACTER_NOT_OWNED` | 403 | 无权操作此角色 |
| `CHARACTER_OFFICIAL_IMMUTABLE` | 403 | 官方角色不可编辑或删除 |
| `CHARACTER_QUOTA_EXCEEDED` | 403 | 角色数量已达上限 (12/12) |
| `CHARACTER_DUPLICATE_NAME` | 409 | 已存在同名角色 |
| `CHARACTER_IMPORT_INVALID` | 400 | 导入文件格式无效 |
| `CHARACTER_IMPORT_TOO_LARGE` | 413 | 导入文件过大（最大 5 MB） |
| `CHARACTER_IMPORT_UNSUPPORTED` | 400 | 不支持的导入格式 |
| `RATE_LIMIT_EXCEEDED` | 429 | 操作过于频繁，请稍后再试 |

---

## 9. Summary

| Category | Count |
|----------|-------|
| Zod schemas | 4 (Create, Update, Import union, Export) |
| Validated fields | 14 |
| Business checks | 4 (quota, ownership, duplicate, immutability) |
| Security rules | 4 (XSS, SQLi, rate limit, auth matrix) |
| Error codes | 10 |
| Fields with 10,000-char limit | 5 (setting, personality, scenario, main_prompt, post_history_instructions) |
| Fields with 500-char limit | 3 (avatar_url, background_url, dialogue_examples) |
| Fields with 200-char limit | 2 (greeting, group_greeting) |
| Fields with 10-char limit | 2 (name, nickname) |

> **Centralization rule:** All validation logic lives in `src/app/api/characters/validations.ts`. No route handler validates independently. Client and server share Zod schemas via barrel export from `@/validations`.