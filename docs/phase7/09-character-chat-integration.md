# 09 — Character → Chat Integration Design

> **Phase 7.2 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation

---

## 1. Current State Audit

### 1.1 Existing `_buildSystemPrompt` (ChatService)

```
System Prompt Block (sent to LLM as system message):
┌────────────────────────────────────────────┐
│ mainPrompt (or DEFAULT_SYSTEM_PROMPT)      │
│   └─ {{original}} → DEFAULT_SYSTEM_PROMPT  │
├────────────────────────────────────────────┤
│ 【角色设定】                                │
│ character.setting                          │
├────────────────────────────────────────────┤
│ 【用户在你眼中的身份】                       │
│ personaSetting (from user)                 │
├────────────────────────────────────────────┤
│ postHistoryInstructions                    │
└────────────────────────────────────────────┘
+
Memory Context (appended as text to system prompt)
+
Chat History (passed as messages array)
```

### 1.2 Unused Character Fields

| Field | DB Column | In ChatService? |
|-------|-----------|-----------------|
| name | name | ❌ — not injected |
| setting | setting | ✅ — as `【角色设定】` |
| greeting | greeting | ❌ — not injected |
| personality | personality | ❌ — not injected |
| scenario | scenario | ❌ — not injected |
| dialogue_examples | dialogue_examples | ❌ — not injected |
| nickname | nickname | ❌ — not injected |
| group_greeting | group_greeting | ❌ — not injected |
| main_prompt | mainPrompt | ✅ — as base system prompt |
| post_history_instructions | postHistoryInstructions | ✅ — appended at end |

---

## 2. Target Prompt Architecture

### 2.1 Assembly Order

```
┌──────────────────────────────────────────────┐
│ 1. System Prompt                             │
│    DEFAULT_SYSTEM_PROMPT                     │
│    ("你是一个AI角色，请根据以下设定...")       │
├──────────────────────────────────────────────┤
│ 2. Main Prompt                               │
│    character.mainPrompt ?? DEFAULT           │
│    {{original}} → DEFAULT_SYSTEM_PROMPT      │
├──────────────────────────────────────────────┤
│ 3. Character Setting                         │
│    character.setting                         │
│    Label: 【角色设定】                         │
├──────────────────────────────────────────────┤
│ 4. Personality                               │
│    character.personality                     │
│    Label: 【性格特点】                         │
│    Conditional: only if non-empty            │
├──────────────────────────────────────────────┤
│ 5. Scenario                                  │
│    character.scenario                        │
│    Label: 【当前情景】                         │
│    Conditional: only if non-empty            │
├──────────────────────────────────────────────┤
│ 6. Dialogue Examples (Few-Shot)              │
│    character.dialogue_examples               │
│    Label: 【对话示例】                         │
│    Format: raw Tavern-style text             │
│    Conditional: only if non-empty            │
├──────────────────────────────────────────────┤
│ 7. Memory Context                            │
│    memories[] (existing logic)               │
│    Label: 【你对用户的了解（长期记忆）】        │
├──────────────────────────────────────────────┤
│ (Separator: message array boundary)          │
├──────────────────────────────────────────────┤
│ 8. Chat History                              │
│    messages[] (existing logic)               │
│    Role: user / assistant                    │
├──────────────────────────────────────────────┤
│ 9. Post History Instructions                 │
│    character.postHistoryInstructions         │
│    Appended to LAST user message             │
│    OR appended as system suffix              │
└──────────────────────────────────────────────┘
```

### 2.2 Field Injection Rules

| # | Field | Injection Point | Conditional | Format |
|---|-------|----------------|-------------|--------|
| 1 | main_prompt | System prompt block (position 2) | Falls back to DEFAULT | Plain text, `{{original}}` resolved |
| 2 | setting | System prompt block (position 3) | Required (always present) | `\n【角色设定】\n{text}` |
| 3 | personality | System prompt block (position 4) | Only if non-empty | `\n【性格特点】\n{text}` |
| 4 | scenario | System prompt block (position 5) | Only if non-empty | `\n【当前情景】\n{text}` |
| 5 | dialogue_examples | System prompt block (position 6) | Only if non-empty | `\n【对话示例】\n{text}` |
| 6 | memories | System prompt block (position 7) | Only if non-empty | Existing format: `\n【长期记忆】\n- {content}` |
| 7 | greeting | First assistant message | Only if chat history is empty | Injected as pre-seeded assistant message |
| 8 | nickname | name replacement | Optional — used as `{nickname}` alias | `\n（你可以称呼角色为{nickname}）` after setting |
| 9 | group_greeting | NOT connected | Stored only per spec | No runtime injection |
| 10 | post_history_instructions | System suffix (position 9) | Only if non-empty | Appended as final system instruction |

### 2.3 greeting Injection Logic

```
On sendMessage():
  if chat_history.length === 0 AND character.greeting is non-empty:
    - Parse greeting by <START> separator
    - Pick first segment as opening message
    - Insert as assistant message BEFORE user's first message
    - Do NOT re-inject if history already exists
```

> Rationale: greeting is the character's opening line. It should appear only when the conversation starts fresh. On regenerate, the greeting is preserved from the original message.

---

## 3. ChatService Interface Changes

### 3.1 `_buildSystemPrompt` Signature

**Current:**
```typescript
_buildSystemPrompt(
  character: {
    mainPrompt?: string | null;
    postHistoryInstructions?: string | null;
    setting?: string | null
  },
  personaSetting?: string
): string
```

**Target:**
```typescript
_buildSystemPrompt(
  character: {
    mainPrompt?: string | null;
    setting?: string | null;
    personality?: string | null;
    scenario?: string | null;
    dialogueExamples?: string | null;
    postHistoryInstructions?: string | null;
    nickname?: string | null;
  },
  personaSetting?: string
): string
```

### 3.2 `sendMessage` Flow Change

```
Current:
  character = findById(characterId)
  build systemPrompt
  fetch memories
  fetch chat history
  save user message
  build messages array [history + user message]
  providerGateway.chat(config, messages, systemPrompt + memories)

Target:
  character = findById(characterId)
  build systemPrompt (expanded with personality/scenario/dialogueExamples/nickname)
  fetch memories
  fetch chat history
  IF history.length === 0 AND character.greeting:
    pre-seed greeting as first assistant message in messages array
  save user message
  build messages array [greeting? + history + user message]
  providerGateway.chat(config, messages, systemPrompt + memories + postHistoryInstructions)
```

---

## 4. Token Budget Estimates

| Section | Typ. Length | Est. Tokens |
|---------|------------|-------------|
| DEFAULT_SYSTEM_PROMPT | 50 chars | ~15 |
| mainPrompt (custom) | 0–10000 | 0–2500 |
| setting | 100–10000 | 25–2500 |
| personality | 0–10000 | 0–2500 |
| scenario | 0–10000 | 0–2500 |
| dialogue_examples | 0–500 | 0–125 |
| memories (10) | 0–1000 | 0–250 |
| chat history (30 msg) | 0–6000 | 0–1500 |
| postHistoryInstructions | 0–10000 | 0–2500 |
| greeting | 0–200 | 0–50 |
| **Total worst case** | — | **~16,440** |
| **Typical case** | — | **~500–1000** |

> Worst case assumes all optional fields filled to 10000 chars. In practice, deep reasoning models handle 100K+ context windows — 16K tokens is well within bounds.

---

## 5. Integration Boundaries

### 5.1 What Changes

| Layer | Change |
|-------|--------|
| `ChatService._buildSystemPrompt` | Accept expanded character fields; add sections for personality, scenario, dialogueExamples, nickname |
| `ChatService.sendMessage` | Check for greeting on empty history; pre-seed |
| `ChatService.regenerateLastAssistantMessage` | Pass expanded character fields |
| `ChatService.continueAssistantMessage` | No change (delegates to sendMessage) |
| `ChatService.getSuggestedReply` | Pass expanded character fields |

### 5.2 What Does NOT Change

| Component | Reason |
|-----------|--------|
| `CharacterService` | No new methods needed — ChatService reads character via `characterRepository.findById()` |
| `CharacterRepository` | Already provides `findById` |
| `characters` DB schema | All fields already exist |
| `ProviderGateway` | Agonistic to prompt content — only receives system string + messages array |
| `MemoryService` | No change — memory extraction is independent of prompt assembly |
| Character API routes | No change |
| Character frontend pages | No change |

---

## 6. group_greeting Design Decision

`group_greeting` is explicitly specified as **"当前版本仅保存字段，不接入群聊系统"**. 

| Design Choice | Rationale |
|---------------|-----------|
| Stored in DB | ✅ — saves user input for future use |
| Sent to ChatService | ❌ — not connected to any runtime logic |
| Injected into prompt | ❌ — no group chat feature exists |
| Exposed in API | ✅ — returned in GET responses (read-only) |
| Editable in UI | ✅ — editable in character edit form |
| Exportable | ✅ — included in Xujing export JSON |

---

## 7. Verification Checklist (for Phase 7.2 Implementation)

| # | Check |
|---|-------|
| 1 | `_buildSystemPrompt` includes personality when non-empty |
| 2 | `_buildSystemPrompt` includes scenario when non-empty |
| 3 | `_buildSystemPrompt` includes dialogue_examples when non-empty |
| 4 | `_buildSystemPrompt` includes nickname hint when non-empty |
| 5 | `sendMessage` injects greeting as first assistant message when history is empty |
| 6 | `sendMessage` does NOT re-inject greeting when history exists |
| 7 | `regenerateLastAssistantMessage` passes expanded character fields |
| 8 | `getSuggestedReply` passes expanded character fields |
| 9 | `group_greeting` is NOT injected into any prompt |
| 10 | `{{original}}` resolves correctly in mainPrompt AND postHistoryInstructions |