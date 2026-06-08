# 16 — Phase 8 Implementation Roadmap

> **Phase 8 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation
> **Builds on**: 13-chat-system-design, 14-chat-ui-spec, 15-chat-api-spec

---

## 1. Implementation Phases

Phase 8 is split into three tiers by priority. Each tier must complete (including verification) before starting the next.

| Tier | Name | What | Files |
|------|------|------|-------|
| P0 | Core Chat | History API + Chat page scaffold + SSE streaming + input bar | 4 new, 0 modified |
| P1 | Regenerate + Suggest | Regenerate endpoint + suggest endpoint + UI actions | 4 new, 2 modified |
| P2 | Polish | Streaming animation + error states + rate limits | 1 new, 3 modified |

---

## 2. P0 — Core Chat (must ship first)

### Step P0.1: `GET /api/chat/[characterId]` — Chat History

**New file**: `src/app/api/chat/[characterId]/route.ts`

```
Export GET(req, { params }):
  1. requireAuth(req)
  2. rateLimit("chat:history", FREE 30/min, VIP 60/min)
  3. Extract { characterId } from params
  4. Read ?limit and ?before from URL query
  5. characterService.getCharacter(characterId, auth) → permission check
  6. messageRepository.findHistory(characterId, limit, before?)
  7. Return jsonOk({ messages, hasMore })
```

**Dependencies**: `messageRepository.findHistory` already exists. Check that `characterService.getCharacter` is importable from the API layer.

**Acceptance**:
- [ ] `GET /api/chat/[characterId]` returns chronological messages (oldest first)
- [ ] `?limit=20` returns at most 20 messages
- [ ] `?before=msgId` returns messages earlier than that ID
- [ ] `hasMore: true` when more messages exist beyond the page
- [ ] 404 when character doesn't exist
- [ ] 403 when user tries to chat with another user's non-official character

---

### Step P0.2: Chat Page Scaffold

**New file**: `src/app/chat/[characterId]/page.tsx`

```
"use client";

Page component:
  - Fetch character data: GET /api/characters/[characterId]
  - Fetch chat history: GET /api/chat/[characterId]
  - State: messages[], streamingContent, isStreaming, error, inputValue
  - Render CharacterHeader + MessageList + InputBar
  - Handle loading / not-found / error states per 14-chat-ui-spec Section 4

Layout:
  - Full-height flex column (h-screen or h-dvh)
  - Header: fixed top, 56px
  - MessageList: flex-1, overflow-y-auto
  - InputBar: fixed bottom, ~64px
```

**Dependencies**: CharacterHeader, MessageList, InputBar components (built in subsequent steps).

**Acceptance**:
- [ ] Page loads at `/chat/[characterId]` without crashing
- [ ] Loading state renders while fetching
- [ ] 404 state when characterId is invalid
- [ ] Character header shows name + avatar
- [ ] Existing messages render in the list

---

### Step P0.3: MessageList + MessageBubble Components

**New files**:
- `src/components/chat/MessageList.tsx`
- `src/components/chat/MessageBubble.tsx`
- `src/components/chat/StreamingText.tsx`

```
MessageList:
  Props: messages, streamingContent, isStreaming, characterName, characterAvatar
  States:
    - Empty (no messages + no greeting): "开始对话吧" centered text
    - Empty with greeting: show greeting as first assistant bubble
    - Has messages: render MessageBubble[] + optional streaming bubble
  Behavior:
    - Auto-scroll to bottom on new message / streaming content
    - Scroll-to-bottom FAB when user has scrolled up >100px
    - role="log", aria-live="polite"

MessageBubble:
  Props: role ("user" | "assistant"), content, timestamp, characterName?, characterAvatar?, isStreaming?
  User style: right-aligned, bg-gray-100, rounded-2xl rounded-br-md
  Assistant style: left-aligned, bg-white border, rounded-2xl rounded-bl-md, avatar + name header
  Timestamp: HH:mm format, relative "刚刚" for <1 min ago

StreamingText:
  Props: content, isStreaming
  Renders text content + blinking cursor (█) when isStreaming
  Cursor CSS: @keyframes blink (1s step-end infinite)
```

**Acceptance**:
- [ ] User messages right-aligned with gray background
- [ ] Assistant messages left-aligned with avatar + name
- [ ] Timestamps display correctly
- [ ] Empty state shows properly
- [ ] Streaming bubble shows blinking cursor
- [ ] Auto-scroll works during streaming

---

### Step P0.4: SSE Streaming Client Integration

**Modify**: `src/app/chat/[characterId]/page.tsx` (add send logic)

```
sendMessage(content):
  1. Append user bubble to messages[] (optimistic)
  2. Set isStreaming = true, streamingContent = ""
  3. POST /api/chat { characterId, content }
  4. Read SSE stream via readChatStream()
  5. On "delta": append to streamingContent
  6. On "done": move streamingContent to messages[] as ASSISTANT, clear streamingContent
  7. On "error": show toast, keep user input in input bar
  8. Set isStreaming = false
```

**Helper**: Create `src/lib/chat-stream.ts` with `readChatStream()` (copy from 15-chat-api-spec §4.2).

**Acceptance**:
- [ ] User message appears instantly (optimistic)
- [ ] Assistant reply streams character by character
- [ ] Blinking cursor during streaming
- [ ] Stream completes: cursor disappears, message persists
- [ ] Error during stream: toast appears, input re-enabled

---

### Step P0.5: InputBar Component

**New file**: `src/components/chat/InputBar.tsx`

```
InputBar:
  Props: onSend(content), disabled, placeholder?
  
  Layout:
    ┌──────────────────────────────┐
    │ [       textarea       ] [➤] │
    └──────────────────────────────┘
  
  Behavior:
    - Auto-resizing textarea (min 1 row, max 4 rows)
    - Max 2000 characters (show count when >1800)
    - Enter sends (Shift+Enter for newline)
    - Auto-focus on mount
    - Clear after send
    - Disabled during streaming (send button shows spinner)
    
  States:
    - Empty → send button disabled, gray
    - Has text → send button enabled, dark
    - Streaming → textarea disabled, button shows spinner
```

**Acceptance**:
- [ ] Enter sends message
- [ ] Shift+Enter inserts newline
- [ ] Send button disabled when empty
- [ ] Input disabled during streaming
- [ ] Character counter appears at 1800+ chars
- [ ] Input clears after successful send

---

## 3. P1 — Regenerate + Suggest

### Step P1.1: `POST /api/chat/[characterId]/regenerate`

**New file**: `src/app/api/chat/[characterId]/regenerate/route.ts`

```
Export POST(req, { params }):
  1. requireAuth(req)
  2. rateLimit("chat:regenerate", FREE 5/min, VIP 15/min)
  3. FREE API key check (same as POST /api/chat)
  4. SSE stream wrapper around chatService.regenerateLastAssistantMessage(userId, characterId)
  5. Same SSE wire format as send
```

**Acceptance**:
- [ ] Deletes last assistant message from DB
- [ ] Streams new response via SSE
- [ ] Rate limited (5/min free)
- [ ] 404 when no assistant message to regenerate

---

### Step P1.2: `POST /api/chat/[characterId]/suggest`

**New file**: `src/app/api/chat/[characterId]/suggest/route.ts`

```
Export POST(req, { params }):
  1. requireAuth(req)
  2. rateLimit("chat:suggest", FREE 5/min, VIP 15/min)
  3. suggestion = await chatService.getSuggestedReply(userId, characterId)
  4. Return jsonOk({ suggestion })
```

**Acceptance**:
- [ ] Returns plain text suggestion string
- [ ] Empty suggestion returns `{ suggestion: "" }` with 200
- [ ] Rate limited (5/min free)

---

### Step P1.3: Regenerate UI

**Modify**: `src/app/chat/[characterId]/page.tsx`

```
Add to header menu (⋮):
  - "重新生成" action
  - Calls POST /api/chat/[characterId]/regenerate (SSE)
  - Removes last assistant bubble from UI
  - Streams new reply
  - Disabled during streaming
```

**Acceptance**:
- [ ] Menu ⋮ opens action sheet
- [ ] "重新生成" removes last reply, streams new one
- [ ] Disabled when no assistant messages exist
- [ ] Disabled during streaming

---

### Step P1.4: Suggested Replies UI

**New file**: `src/components/chat/SuggestedReplies.tsx`

```
SuggestedReplies:
  Props: suggestions[], onSelect(text)
  
  Layout:
    Horizontal scroll row of chips
    Each chip: rounded-full, bg-gray-100, 13px
  
  Behavior:
    - Fetches from POST /api/chat/[characterId]/suggest on mount (if messages exist)
    - Re-fetches after each assistant reply completes
    - Tap chip → fills input with suggestion text
    - Hidden during streaming
    - Refresh button at end to re-fetch
```

**Acceptance**:
- [ ] Chips appear after conversation has messages
- [ ] Tapping chip fills input
- [ ] Hidden during streaming
- [ ] Refresh button works

---

## 4. P2 — Polish

### Step P2.1: Streaming Animation Polish

**Modify**: `src/components/chat/StreamingText.tsx`

```
- Smooth cursor blink animation
- Prevent layout jumps (overflow-anchor: auto on container)
- Throttle re-renders: update DOM every 50ms or 3+ new chars
```

**Acceptance**:
- [ ] Cursor blink is smooth (no flicker)
- [ ] Page doesn't jump during streaming
- [ ] Performance acceptable on mobile

---

### Step P2.2: Error State Polish

**Modify**: `src/app/chat/[characterId]/page.tsx`

```
- Error toast component at top of page
- Red background, auto-dismiss 5s
- Swipe to dismiss on mobile
- "FREE no API key" state: yellow banner with link to /api-connections
- Network error: retry button
```

**Acceptance**:
- [ ] Error toast appears on stream failure
- [ ] Auto-dismiss works
- [ ] FREE-no-API-key banner renders correctly
- [ ] Retry available on network errors

---

### Step P2.3: Rate Limit on Chat Endpoints

**Modify**: `src/app/api/chat/route.ts` (existing)

Add rate limit check before the SSE streaming logic:

```
const rl = await rateLimit(auth.userId, "chat:send", {
  free: { limit: 20, windowMs: 60_000 },
  vip: { limit: 60, windowMs: 60_000 },
}, auth.subscription);
if (rl) return rl;
```

New endpoints (P0.1, P1.1, P1.2) already include rate limits per their route specs.

**Acceptance**:
- [ ] 429 returned after exceeding FREE send limit (20/min)
- [ ] 429 returned after exceeding VIP send limit (60/min)
- [ ] All 4 chat endpoints have rate limiting

---

### Step P2.4: Input Validation

**Modify**: `src/app/api/chat/route.ts`

Add content length check:

```
if (body.content.length > 2000) return jsonErr("消息内容不能超过 2000 个字符", 400);
```

**Acceptance**:
- [ ] Content >2000 chars returns 400
- [ ] Frontend InputBar already caps at 2000 — this is defense in depth

---

## 5. Complete File Inventory

### New Files (to create)

| # | File | Step | Purpose |
|---|------|------|---------|
| 1 | `src/app/api/chat/[characterId]/route.ts` | P0.1 | Chat history endpoint |
| 2 | `src/app/chat/[characterId]/page.tsx` | P0.2 | Chat page |
| 3 | `src/components/chat/MessageList.tsx` | P0.3 | Message list container |
| 4 | `src/components/chat/MessageBubble.tsx` | P0.3 | Individual message bubble |
| 5 | `src/components/chat/StreamingText.tsx` | P0.3 | Streaming text with cursor |
| 6 | `src/components/chat/InputBar.tsx` | P0.5 | Message input bar |
| 7 | `src/lib/chat-stream.ts` | P0.4 | SSE reader utility |
| 8 | `src/app/api/chat/[characterId]/regenerate/route.ts` | P1.1 | Regenerate endpoint |
| 9 | `src/app/api/chat/[characterId]/suggest/route.ts` | P1.2 | Suggest endpoint |
| 10 | `src/components/chat/SuggestedReplies.tsx` | P1.4 | Suggestion chips |

### Modified Files

| # | File | Step | Change |
|---|------|------|--------|
| 1 | `src/app/api/chat/route.ts` | P2.3, P2.4 | Add rate limit + content length check |
| 2 | `src/components/chat/StreamingText.tsx` | P2.1 | Animation polish |
| 3 | `src/app/chat/[characterId]/page.tsx` | P1.3, P2.2 | Menu actions + error states |

### NOT Modified

| File | Reason |
|------|--------|
| `src/server/services/chat.service.ts` | All methods needed (sendMessage, regenerate, continue, suggest) already exist |
| `src/server/services/character.service.ts` | No changes — ChatService reads directly from characterRepository |
| `src/server/repositories/message.repository.ts` | `findHistory`, `deleteLastAssistant`, `create` all exist |
| `src/server/services/provider-gateway.ts` | No changes — prompt-agnostic |
| `src/app/api/_base/rate-limit.ts` | Already supports per-action rate limiting |
| `src/app/api/_base/auth.ts` | No changes |
| `src/app/api/_base/response.ts` | No changes |

---

## 6. Implementation Dependencies

```
P0.1 (history API)
  │
  ├── P0.2 (chat page scaffold) ── depends on P0.1 for loading history
  │     │
  │     ├── P0.3 (MessageList + Bubble) ── depends on P0.2 for page context
  │     │
  │     └── P0.5 (InputBar) ── depends on P0.2 for page context
  │
  └── P0.4 (SSE client) ── depends on P0.1 (uses same API patterns)
        │
        └── P0.5 wiring ── InputBar.onSend → P0.4 sendMessage → SSE stream → P0.3 bubbles

P1.1 (regenerate API) ── independent
P1.2 (suggest API) ── independent
  │
  ├── P1.3 (regenerate UI) ── depends on P1.1 + P0.2
  └── P1.4 (suggest UI) ── depends on P1.2 + P0.2

P2.1 (animation) ── depends on P0.3
P2.2 (error states) ── depends on P0.2
P2.3 (rate limits) ── depends on P1.1
P2.4 (input validation) ── depends on P0.5
```

---

## 7. Verification Plan

After all P0 steps complete:

1. Start dev server
2. Navigate to `/characters` → create a test character
3. Click character → navigate to `/chat/[characterId]`
4. Verify: greeting displays (if set), empty state shows
5. Type a message → Enter
6. Verify: user bubble appears, assistant bubble streams
7. Refresh page → verify messages persist (history API)
8. Try `/chat/nonexistent-id` → verify 404 state

After P1:

9. Send message → tap ⋮ → 重新生成 → verify old reply deleted, new one streams
10. Send message → verify suggestion chips appear → tap one → verify input fills

After P2:

11. Send 21 messages in 1 minute (FREE) → verify 429
12. Type 2001 chars → verify input capped at 2000, API rejects if bypassed
13. Kill network mid-stream → verify error toast + retry

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `messageRepository.findHistory` returns DESC order | Medium | High — messages display in reverse | Verify and sort in route handler if needed |
| SSE parsing edge cases (split UTF-8, partial JSON) | Medium | Medium | `readChatStream` handles split lines; verify with emoji content |
| Next.js App Router params handling for `[characterId]` | Low | Low | Standard pattern used across existing routes |
| Character permission handling for official vs user characters | Low | Medium | Reuse existing `characterService.getCharacter()` |
| Rate limiter state grows unbounded | Low | Low | Existing cleanup interval handles this |
