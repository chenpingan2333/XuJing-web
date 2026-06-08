# 15 — Chat API Specification

> **Phase 8 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation
> **Audience**: Frontend developers implementing chat UI, backend developers adding endpoints

---

## 1. Endpoint Inventory

| # | Method | Path | Purpose | Exists? |
|---|--------|------|---------|---------|
| 1 | `POST` | `/api/chat` | Send message (SSE stream) | ✅ Phase 4.2 |
| 2 | `GET` | `/api/chat/[characterId]` | Load chat history | ❌ **To build** |
| 3 | `POST` | `/api/chat/[characterId]/regenerate` | Regenerate last reply (SSE stream) | ❌ **To build** |
| 4 | `POST` | `/api/chat/[characterId]/suggest` | Get suggested reply | ❌ **To build** |

All endpoints require authentication. All use `jsonErr` for error responses (same format as every other route in the app).

---

## 2. Common Behavior

### 2.1 Authentication

Every endpoint calls `requireAuth(req)` from `src/app/api/_base/auth.ts`. Unauthenticated → `401`.

```
Request headers:
  x-auth-user-id: string       (required, set by middleware)
  x-auth-role: "USER" | "ADMIN" (required)
  x-auth-subscription: "free" | "vip" (required)
  x-auth-jti: string           (required)
```

### 2.2 Response Envelope

All non-SSE responses use the standard app envelope:

```typescript
// Success
{ success: true, data: T, timestamp: string }

// Error
{ success: false, error: string, timestamp: string }
```

SSE responses use a plain `text/event-stream` with `data: {JSON}\n\n` lines.

### 2.3 Rate Limiting

| Endpoint | Action Key | FREE | VIP |
|----------|-----------|------|-----|
| `POST /api/chat` | `chat:send` | 20/min | 60/min |
| `GET /api/chat/[characterId]` | `chat:history` | 30/min | 60/min |
| `POST .../regenerate` | `chat:regenerate` | 5/min | 15/min |
| `POST .../suggest` | `chat:suggest` | 5/min | 15/min |

Enforcement uses the existing `rateLimit()` from `src/app/api/_base/rate-limit.ts`.

Rate-limited response: `429` with `{ success: false, error: "操作过于频繁，请稍后再试" }`.

### 2.4 FREE Tier API Key Check

`POST /api/chat` and `POST .../regenerate` check: if `subscription === "free"` and user has no API config → `400` with `"未配置 API 接口，请前往 API 连接页面配置"`.

### 2.5 Input Validation

| Field | Limit | Enforcement |
|-------|-------|-------------|
| `content` (send message) | max 2000 chars | Route handler rejects with `400` |
| `characterId` | required string | Route handler validates |

---

## 3. Endpoint Specifications

### 3.1 `POST /api/chat` — Send Message

> **Status**: ✅ Exists (Phase 4.2). No changes needed in Phase 8.

**Request**

```
POST /api/chat
Content-Type: application/json

{
  "characterId": "uuid-string",
  "content": "你好，今天天气怎么样？"
}
```

**Response (SSE Stream)**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"delta","content":"今"}

data: {"type":"delta","content":"天"}

data: {"type":"delta","content":"天气"}

data: {"type":"done"}
```

**SSE Event Types**

| `type` | `content` | Meaning |
|--------|-----------|---------|
| `delta` | string | Token-level streaming content. Append to display buffer. |
| `done` | — (absent) | Stream complete. Assistant message persisted to DB. Trigger memory extraction. |
| `error` | string (in `message` field) | Error occurred. Display toast. Message NOT persisted. |

**Error Response (non-SSE — validation failures)**

```json
{
  "success": false,
  "error": "characterId and content are required",
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

Possible validation errors:

| Status | Condition |
|--------|-----------|
| 400 | Invalid JSON body |
| 400 | Missing `characterId` or `content` |
| 400 | `content` exceeds 2000 characters |
| 400 | FREE user with no API config |

---

### 3.2 `GET /api/chat/[characterId]` — Chat History

> **Status**: ❌ To build in Phase 8

**Request**

```
GET /api/chat/uuid-string?limit=50&before=message-id
```

| Query Param | Type | Default | Max | Description |
|-------------|------|---------|-----|-------------|
| `limit` | integer | 50 | 50 | Page size |
| `before` | string (message ID) | — | — | Cursor for pagination (exclusive) |

**Response 200**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg-uuid-1",
        "role": "USER",
        "content": "你好！",
        "createdAt": "2026-06-08T09:00:00.000Z"
      },
      {
        "id": "msg-uuid-2",
        "role": "ASSISTANT",
        "content": "你好呀！今天想聊些什么？",
        "createdAt": "2026-06-08T09:00:05.000Z"
      }
    ],
    "hasMore": false
  }
}
```

**Messages are returned in chronological order (oldest first).**

**Error Responses**

| Status | Error Message | Condition |
|--------|--------------|-----------|
| 401 | Authentication required | No auth headers |
| 404 | 角色不存在 | characterId not found in DB |
| 429 | 操作过于频繁，请稍后再试 | Rate limited |

**Implementation Notes**

- Calls `messageRepository.findHistory(characterId, limit, before?)`
- Chronological order: `ORDER BY created_at ASC` (existing repo method returns DESC by convention — verify and adjust)
- Permission: user can only see their own messages for that character. If character is official, any user can see their own messages. If character is user-created, only the owner can see their messages. (Leverage existing `characterService.getCharacter()` for permission check.)

---

### 3.3 `POST /api/chat/[characterId]/regenerate` — Regenerate Last Reply

> **Status**: ❌ To build in Phase 8

**Request**

```
POST /api/chat/uuid-string/regenerate
Content-Type: application/json

(no body required)
```

**Response (SSE Stream — identical to send message)**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"delta","content":"..."}

data: {"type":"done"}
```

**Behavior**

1. Delete the last ASSISTANT message for this character+user from DB
2. Re-send the last USER message to the LLM (same prompt assembly, same history — minus the deleted assistant message)
3. Stream the new response via SSE
4. Persist the new ASSISTANT message on `done`

**Frontend Expectations**

- Delete the last assistant bubble from the UI before calling
- Show new streaming bubble
- `regenerateLastAssistantMessage()` already exists in `ChatService` — route just needs to wire it up

**Error Responses**

| Status | Error Message | Condition |
|--------|--------------|-----------|
| 400 | Invalid JSON body | Malformed request |
| 400 | 未配置 API 接口，请前往 API 连接页面配置 | FREE user with no API config |
| 401 | Authentication required | No auth headers |
| 404 | 角色不存在 | characterId not found |
| 404 | 没有可重新生成的消息 | No ASSISTANT message to delete |
| 429 | 操作过于频繁，请稍后再试 | Rate limited |

**Implementation Notes**

- Delegates to `chatService.regenerateLastAssistantMessage(userId, characterId)`
- `deleteLastAssistant` inside the service handles the "no message" case — should yield error event if nothing to delete
- Rate limit: stricter than send (5/min free, 15/min VIP) — prevents abuse

---

### 3.4 `POST /api/chat/[characterId]/suggest` — Suggested Reply

> **Status**: ❌ To build in Phase 8

**Request**

```
POST /api/chat/uuid-string/suggest
Content-Type: application/json

(no body required)
```

**Response 200**

```json
{
  "success": true,
  "data": {
    "suggestion": "你今天想聊些什么呢？"
  },
  "timestamp": "2026-06-08T10:00:00.000Z"
}
```

> `suggestion` is a plain string. It may be empty (`""`) if the LLM returns nothing usable.

**Behavior**

- Uses existing `chatService.getSuggestedReply(userId, characterId)`
- Calls LLM with a meta-prompt: "请以用户的身份，生成一条简短的回复建议"
- Returns plain text suggestion
- Does NOT save anything to DB

**Frontend Expectations**

- Call on page load (when conversation has messages) to seed suggestion chips
- Call after each assistant reply to refresh chips
- Debounce: max 1 call per 5 seconds
- `suggestion` is empty → don't show chips

**Error Responses**

| Status | Error Message | Condition |
|--------|--------------|-----------|
| 401 | Authentication required | No auth headers |
| 404 | 角色不存在 | characterId not found |
| 429 | 操作过于频繁，请稍后再试 | Rate limited |

**Implementation Notes**

- This is a plain JSON endpoint, NOT SSE
- `getSuggestedReply` already exists in `ChatService` — route just needs to wire it up
- If `suggestion` is empty string, still return `200` with `{ suggestion: "" }` — frontend handles display logic

---

## 4. SSE Stream Contract

### 4.1 Wire Format

```
data: {"type":"delta","content":"今"}\n\n
data: {"type":"delta","content":"天"}\n\n
data: {"type":"done"}\n\n
```

Each line is `data: ` + JSON + `\n\n`. The JSON is a `ChatEvent`:

```typescript
type ChatEvent =
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };
```

### 4.2 Client-Side Reader (copy-paste for frontend)

```typescript
async function* readChatStream(res: Response): AsyncGenerator<ChatEvent> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No reader");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        yield JSON.parse(line.slice(6)) as ChatEvent;
      }
    }
  }
}
```

### 4.3 Frontend State Machine

```
IDLE ──(user sends)──> STREAMING ──("done")──> IDLE
                         │
                         └──("error")──> ERROR ──(dismiss)──> IDLE
```

During STREAMING:
- Input bar disabled, send button shows spinner
- Last assistant bubble shows blinking cursor
- Auto-scroll follows new content
- Suggested replies hidden

---

## 5. Error Catalog

| HTTP Status | Error Message (zh-CN) | Endpoint(s) | Notes |
|-------------|----------------------|-------------|-------|
| 400 | Invalid JSON body | all POST | Body parse failure |
| 400 | characterId and content are required | POST /api/chat | Missing fields |
| 400 | 消息内容不能超过 2000 个字符 | POST /api/chat | Content too long |
| 400 | 未配置 API 接口，请前往 API 连接页面配置 | POST send, POST regenerate | FREE tier check |
| 401 | Authentication required | all | `requireAuth` fail |
| 404 | 角色不存在 | GET history, POST regenerate, POST suggest | DB lookup fail |
| 404 | 没有可重新生成的消息 | POST regenerate | No assistant message to delete |
| 429 | 操作过于频繁，请稍后再试 | all | Rate limit hit |
| 500 | 获取消息历史失败 | GET history | Unexpected DB/query error |
| 500 | AI调用失败 | POST send, POST regenerate | ProviderGateway error |

---

## 6. Client ↔ Server Contract Summary

| Client Action | HTTP Call | Body | Response Type | UI Update |
|---------------|-----------|------|---------------|-----------|
| Load chat page | `GET /api/chat/[id]` | — | JSON `{ messages[], hasMore }` | Render message list |
| Send message | `POST /api/chat` | `{ characterId, content }` | SSE stream | Append user bubble → stream assistant bubble |
| Regenerate | `POST /api/chat/[id]/regenerate` | — | SSE stream | Remove last assistant bubble → stream new one |
| Get suggestions | `POST /api/chat/[id]/suggest` | — | JSON `{ suggestion }` | Show suggestion chips |

---

## 7. Character Permission Model for Chat

| Character Type | Who Can Chat | Rule |
|----------------|-------------|------|
| Official (`is_official = true`) | Any authenticated user | Public access |
| User-created (`is_official = false`) | Owner only | `character.user_id === auth.userId` |

Permission check reuses `characterService.getCharacter(characterId, auth)` (implemented in Phase 7.1). Returns 403 if user is not the owner of a non-official character.

---

## 8. Route File Layout

```
src/app/api/chat/
├── route.ts                        # POST /api/chat (exists, no changes)
└── [characterId]/
    ├── route.ts                    # GET /api/chat/[characterId] (NEW)
    ├── regenerate/
    │   └── route.ts                # POST .../regenerate (NEW)
    └── suggest/
        └── route.ts                # POST .../suggest (NEW)
```
