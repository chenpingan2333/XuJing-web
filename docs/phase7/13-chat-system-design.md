# 13 — Chat System Design

> **Phase 8 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation

---

## 1. Current State

### 1.1 What Exists (Phase 4.2 + 7.2)

| Component | Status |
|-----------|--------|
| `POST /api/chat` (SSE streaming) | ✅ |
| `ChatService.sendMessage()` | ✅ |
| `ChatService.regenerateLastAssistantMessage()` | ✅ |
| `ChatService.continueAssistantMessage()` | ✅ |
| `ChatService.getSuggestedReply()` | ✅ |
| `ProviderGateway` (OpenAI/Anthropic/Gemini) | ✅ |
| `MessageRepository` (CRUD + history) | ✅ |
| `MemoryService` (keyword extraction) | ✅ |
| Character → Chat prompt integration | ✅ Phase 7.2 |
| Chat UI | ❌ **None exists** |

### 1.2 What Phase 8 Must Build

| Component | Priority |
|-----------|----------|
| Chat UI page (`/chat/[characterId]`) | P0 |
| Chat history API (`GET /api/chat/[characterId]`) | P0 |
| Regenerate API (`POST /api/chat/[characterId]/regenerate`) | P1 |
| Suggest API (`POST /api/chat/[characterId]/suggest`) | P1 |
| Message list with SSE streaming display | P0 |
| Message bubble UI (user/assistant) | P0 |
| Streaming text animation | P0 |
| Input bar with send button | P0 |
| Character header bar | P0 |

---

## 2. Architecture

### 2.1 System Diagram

```
┌──────────────────────────────────────────────────┐
│                    Frontend                       │
│  /chat/[characterId]                              │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Char Header│  │ Messages │  │ Input Bar     │  │
│  │ (avatar,   │  │ (SSE-    │  │ (text input,  │  │
│  │  name,     │  │  streamed│  │  send,        │  │
│  │  back btn) │  │  bubbles)│  │  quick actions)│  │
│  └────────────┘  └──────────┘  └──────────────┘  │
└────────────────────┬─────────────────────────────┘
                     │ fetch + SSE
                     ▼
┌──────────────────────────────────────────────────┐
│                  API Layer                        │
│  GET  /api/chat/[characterId]      history        │
│  POST /api/chat                     send (SSE)    │
│  POST /api/chat/[characterId]/regenerate          │
│  POST /api/chat/[characterId]/suggest             │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│                ChatService                        │
│  sendMessage / regenerate / continue / suggest    │
│  _buildSystemPrompt (Phase 7.2 expanded)          │
│  _extractMemoriesAsync                            │
└────────┬──────────────────────┬──────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐  ┌──────────────────┐
│  ProviderGateway│  │  Character Repo  │
│  Message Repo   │  │  Memory Repo     │
│  User Repo      │  │  API Config Repo │
└─────────────────┘  └──────────────────┘
```

### 2.2 Data Flow — Send Message

```
User types message → clicks Send
  │
  ├─ Frontend: append user bubble immediately (optimistic)
  ├─ Frontend: POST /api/chat { characterId, content }
  │
  ├─ API: requireAuth → check FREE API key → call chatService.sendMessage()
  │
  ├─ ChatService:
  │   ├─ find character + user
  │   ├─ resolve API config (FREE/VIP)
  │   ├─ _buildSystemPrompt (Phase 7.2 assembly)
  │   ├─ fetch memories + history
  │   ├─ P2: inject greeting if empty history
  │   ├─ save user message to DB
  │   └─ call providerGateway.chat() → SSE stream
  │
  ├─ API: wrap ChatEvent stream as SSE (data: {...}\n\n)
  │
  └─ Frontend: read SSE stream
      ├─ "delta" → append to streaming assistant bubble
      ├─ "done" → finalize bubble, trigger memory extraction
      └─ "error" → show error toast
```

---

## 3. API Specification

### 3.1 `GET /api/chat/[characterId]` — History

```
Method: GET
Auth: Required
Params: characterId (path)
Query: ?limit=50 (default), ?before=messageId (cursor)

Response 200:
{
  success: true,
  data: {
    messages: [
      { id, role, content, createdAt },
      ...
    ],
    hasMore: boolean
  }
}
```

### 3.2 `POST /api/chat` — Send Message (existing, no change)

```
Method: POST
Auth: Required
Body: { characterId: string, content: string }
Response: SSE stream (text/event-stream)
  data: {"type":"delta","content":"..."}
  data: {"type":"done"}
  data: {"type":"error","message":"..."}
```

### 3.3 `POST /api/chat/[characterId]/regenerate` — Regenerate

```
Method: POST
Auth: Required
Params: characterId (path)
Response: SSE stream (same as send)

Behavior:
- Delete last ASSISTANT message
- Re-send the last USER message to LLM
- Stream new response
```

### 3.4 `POST /api/chat/[characterId]/suggest` — Suggested Reply

```
Method: POST
Auth: Required
Params: characterId (path)
Response 200:
{
  success: true,
  data: { suggestion: "..." }
}
```

---

## 4. Chat UI Design

### 4.1 Page Route

`/chat/[characterId]`

### 4.2 Component Tree

```
ChatPage
├── CharacterHeader
│   ├── BackButton → /characters
│   ├── Avatar (48px circle)
│   ├── Name
│   └── MenuButton (regenerate, clear, etc.)
├── MessageList
│   ├── EmptyState (no messages yet)
│   │   └── GreetingBubble (if character.greeting exists)
│   └── MessageBubble[] (scrollable)
│       ├── UserBubble (right-aligned, gray)
│       └── AssistantBubble (left-aligned, with avatar)
│           └── StreamingText (animated cursor during SSE)
├── SuggestedReplies (horizontal scroll chips)
└── InputBar
    ├── TextInput (auto-growing textarea)
    └── SendButton (disabled when empty)
```

### 4.3 States

| State | UI |
|-------|-----|
| Loading | Full-page spinner |
| Empty conversation | Greeting bubble (if exists) + "开始对话吧" placeholder |
| Streaming | Animated cursor in last assistant bubble |
| Error | Red toast at top, message persists in input |
| FREE no API key | "请先配置 API" with link to /api-connections |
| Character not found | 404 page |

### 4.4 Interaction Patterns

| Action | Trigger | Feedback |
|--------|---------|----------|
| Send message | Enter key or Send button | User bubble appears, assistant bubble streams |
| Regenerate | Menu → Regenerate | Delete last reply, re-stream |
| Continue | "继续" chip | Send "（请继续）" |
| Suggested reply | Tap suggestion chip | Auto-fill input |
| Scroll to bottom | New message or user scroll | Auto-scroll (unless user scrolled up) |

---

## 5. SSE Streaming Client

### 5.1 Reader Pattern

```typescript
async function *readChatStream(response: Response): AsyncGenerator<ChatEvent> {
  const reader = response.body?.getReader();
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
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
```

### 5.2 State Management

```
messages: Message[]           // loaded history + new messages
streamingContent: string      // current assistant reply being streamed
isStreaming: boolean          // true during SSE
error: string | null          // error state
inputValue: string            // text input
```

---

## 6. Message Bubble Design

### 6.1 User Bubble

```
┌──────────────────────────────┐
│                    ┌───────┐ │
│  消息内容...       │ 14:30 │ │
│                    └───────┘ │
└──────────────────────────────┘
  Right-aligned, gray-100 bg, rounded-2xl, max-w-[80%]
```

### 6.2 Assistant Bubble

```
┌──────────────────────────────────────┐
│ 🤖 角色名                            │
│                                      │
│ 回复内容...                          │
│ █ (streaming cursor)                 │
│                             刚刚     │
└──────────────────────────────────────┘
  Left-aligned, white bg, rounded-2xl, max-w-[80%]
  Streaming: blinker cursor at end
```

### 6.3 Streaming Animation

- Blinking `|` cursor at end of streaming text
- Smooth scroll to bottom on new content
- Throttled re-render (every 50ms or 3+ chars)

---

## 7. Character Context Integration

### 7.1 Prompt Assembly (Phase 7.2)

Already implemented in ChatService. No changes needed in Phase 8.

### 7.2 Character Header Data

Fetch from `GET /api/characters/[characterId]`:

```typescript
interface CharacterHeader {
  name: string;
  avatarUrl?: string;
  isOfficial: boolean;
}
```

### 7.3 Greeting Display

If `character.greeting` exists and conversation is empty:
- Show greeting as pre-rendered assistant bubble
- P2 already handles injection into LLM context

---

## 8. Security & Performance

### 8.1 Rate Limiting

| Endpoint | FREE | VIP |
|----------|------|-----|
| POST /api/chat | 20/min | 60/min |
| POST regenerate | 5/min | 15/min |
| POST suggest | 5/min | 15/min |
| GET history | 30/min | 60/min |

### 8.2 Message Limits

| Limit | Value |
|-------|-------|
| Context window (sent to LLM) | Last 30 messages |
| History API page size | 50 messages |
| Max message content length | 2000 chars (input validation) |

### 8.3 Token Budget

| Section | Max Tokens |
|---------|-----------|
| System prompt (all sections) | ~4000 (with max fills) |
| Chat history (30 msgs) | ~2000 |
| User message | ~500 |
| **Total per request** | **~6500** |

> Well within 8K–128K model context windows.

---

## 9. Phase 8 Implementation Order

| Step | Task | Priority |
|------|------|----------|
| 1 | `GET /api/chat/[characterId]` history endpoint | P0 |
| 2 | Chat page scaffold (`/chat/[characterId]`) | P0 |
| 3 | Message bubble components | P0 |
| 4 | SSE streaming client integration | P0 |
| 5 | Input bar + send message flow | P0 |
| 6 | Character header bar | P0 |
| 7 | Regenerate endpoint + UI | P1 |
| 8 | Suggest endpoint + UI chips | P1 |
| 9 | Continue reply action | P1 |
| 10 | Streaming animation polish | P2 |
| 11 | Error states + empty states | P2 |
| 12 | Rate limiting on chat endpoints | P2 |