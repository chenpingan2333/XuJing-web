# 11 — Phase 7.2 Acceptance Criteria

> **Phase 7.2 Design Freeze** | **Date**: 2026-06-08
> **Purpose**: Define audit criteria for Phase 7.2 implementation review.
> **Status**: Frozen — awaiting Phase 7.2 implementation before audit.

---

## Audit Categories

| ID | Category | Source Doc |
|----|----------|------------|
| A1 | Prompt Injection | 09-character-chat-integration.md |
| A2 | Memory Integration | 09-character-chat-integration.md |
| A3 | Type Safety | 10-character-technical-debt.md (TD-1, TD-2) |
| A4 | Duplicate Detection | 10-character-technical-debt.md (TD-3, TD-4) |
| A5 | Rate Limit Architecture | 10-character-technical-debt.md (TD-5) |
| A6 | Pagination Design | 10-character-technical-debt.md (TD-6) |
| A7 | No Product Scope Changes | All design docs |

---

## A1 — Prompt Injection Audit

### A1.1 Prompt Assembly Order

Verify the system prompt is assembled in exact order:

| Position | Section | Source Field |
|----------|---------|-------------|
| 1 | System Prompt | DEFAULT_SYSTEM_PROMPT |
| 2 | Main Prompt | character.mainPrompt (with `{{original}}` resolved) |
| 3 | Character Setting | character.setting |
| 4 | Personality | character.personality |
| 5 | Scenario | character.scenario |
| 6 | Dialogue Examples | character.dialogueExamples |
| 7 | Memory Context | memories[] |
| 8 | Post History Instructions | character.postHistoryInstructions |

**Pass criteria:**

- [ ] `_buildSystemPrompt` in ChatService includes all 8 sections
- [ ] Sections appear in the specified order
- [ ] Optional sections (4,5,6,7,8) are omitted when field is empty/null
- [ ] `{{original}}` resolves to DEFAULT_SYSTEM_PROMPT in mainPrompt
- [ ] `{{original}}` resolves to DEFAULT_SYSTEM_PROMPT in postHistoryInstructions

### A1.2 Field Injection Verification

| # | Field | Injection Test |
|---|-------|---------------|
| 1 | personality | Set personality="乐观开朗" → verify `【性格特点】\n乐观开朗` in system prompt |
| 2 | scenario | Set scenario="咖啡店里" → verify `【当前情景】\n咖啡店里` in system prompt |
| 3 | dialogue_examples | Set to `{{char}}: 你好\n{{user}}: 嗨` → verify `【对话示例】\n{{char}}: 你好\n{{user}}: 嗨` in system prompt |
| 4 | nickname | Set nickname="小爱" → verify nickname hint in system prompt |
| 5 | greeting | Set greeting, new conversation → verify greeting injected as first assistant message |
| 6 | greeting | Set greeting, existing conversation → verify greeting NOT re-injected |
| 7 | group_greeting | Set group_greeting="大家好" → verify NOT present in system prompt |

**Pass criteria:**

- [ ] All 7 injection tests produce expected output
- [ ] No field leaks into wrong section

### A1.3 Greeting Edge Cases

| Test | Expected |
|------|----------|
| greeting = "Hello<START>Hi there" | First segment "Hello" injected |
| greeting = "" | No greeting injected |
| History has 5 messages | No greeting injected (history exists) |
| Regenerate on first message | Greeting preserved from original assistant message |

**Pass criteria:**

- [ ] `<START>` separator correctly split
- [ ] Only first segment used as greeting
- [ ] Empty greeting has no effect
- [ ] Greeting not duplicated on regenerate

---

## A2 — Memory Integration Audit

### A2.1 Memory Position in Prompt

Verify memories appear AFTER dialogue examples and BEFORE post history instructions.

**Pass criteria:**

- [ ] Memory section labeled `【你对用户的了解（长期记忆）】`
- [ ] Each memory formatted as `- {content}` bullet
- [ ] Memory section omitted when `memories.length === 0`

### A2.2 Memory Extraction Independence

Memory extraction (`_extractMemoriesAsync`) must NOT be affected by prompt assembly changes.

**Pass criteria:**

- [ ] `_extractMemoriesAsync` unchanged from Phase 4.2
- [ ] Memory capacity (FREE=100, VIP=10000) unchanged
- [ ] Memory eviction logic unchanged

---

## A3 — Type Safety Audit

### A3.1 `as any` Elimination

| File | Line | Status |
|------|------|--------|
| character.service.ts:154 | `} as any);` | Must be replaced with typed helper |

**Pass criteria:**

- [ ] Zero `as any` casts in character.service.ts
- [ ] `toInsertData()` or equivalent typed function exists
- [ ] `nullIfEmpty()` has explicit return types
- [ ] `npx tsc --noEmit` passes with 0 errors in character code

### A3.2 Service Layer Zod (TD-1)

| Method | Must Have |
|--------|-----------|
| createCharacter | `CreateCharacterSchema.parse(data)` at top |
| updateCharacter | `UpdateCharacterSchema.parse(data)` at top |
| importCharacter | Already has Zod chain — no change needed |

**Pass criteria:**

- [ ] `createCharacter` re-validates with Zod before processing
- [ ] `updateCharacter` re-validates with Zod before processing
- [ ] Zod errors in service throw `CharacterError` with correct code

---

## A4 — Duplicate Detection Audit

### A4.1 Case-Insensitive Behavior

| Input Pair | Expected |
|------------|----------|
| "Alice" + "Alice" | Conflict |
| "Alice" + "alice" | Conflict |
| "Alice" + "ALICE" | Conflict |
| "Alice" + "Bob" | No conflict |

**Pass criteria:**

- [ ] All 4 cases behave as expected
- [ ] Error message: `已存在同名角色「Alice」` (shows original casing)

### A4.2 Update Exclusion

Update "Alice" → keep name "Alice" → no false positive conflict.

**Pass criteria:**

- [ ] Updating a character without changing the name does not trigger duplicate error
- [ ] `excludeId` parameter correctly passed through

---

## A5 — Rate Limit Architecture Audit

### A5.1 Current Implementation

| Endpoint | FREE | VIP |
|----------|------|-----|
| GET /api/characters (list) | 30/min | 60/min |
| POST /api/characters (create) | 5/min | 20/min |
| GET /api/characters/:id | 30/min | 60/min |
| PUT /api/characters/:id | 10/min | 30/min |
| DELETE /api/characters/:id | 5/min | 10/min |
| POST /api/characters/import | 3/min | 10/min |
| GET /api/characters/:id/export | 10/min | 20/min |

**Pass criteria:**

- [ ] All 7 endpoints have `rateLimit()` calls
- [ ] Rate limits match the spec table above
- [ ] Rate limit exceeded returns `429` with Chinese error message
- [ ] Rate limiter does not block requests within limit
- [ ] Cleanup interval does not leak memory

### A5.2 Future Redis Design

Acceptance for the design (not implementation):
- [ ] Redis Lua script design exists in 10-character-technical-debt.md
- [ ] Atomicity concerns addressed (ZREMRANGEBYSCORE + ZADD in one Lua script)
- [ ] Migration path from in-memory to Redis is documented

---

## A6 — Pagination Design Audit

Design acceptance only — implementation deferred to post-MVP.

- [ ] Cursor-based pagination design exists in 10-character-technical-debt.md
- [ ] API contract defined: `?type=user&limit=20&cursor=xxx`
- [ ] Response shape defined: `{ items, nextCursor, total }`
- [ ] Official characters NOT paginated (small fixed set)
- [ ] User characters paginated with limit=20

---

## A7 — No Product Scope Changes

All design documents must be consistent with Phase 7.1 frozen spec.

**Forbidden changes:**
- [ ] No new database columns
- [ ] No new database tables
- [ ] No new API endpoints beyond what is documented
- [ ] No changes to CharacterRepository interface
- [ ] No changes to Auth system
- [ ] No changes to ProviderGateway
- [ ] No changes to FREE/VIP quota rules
- [ ] No changes to field length limits

**Allowed:**
- [ ] ChatService `_buildSystemPrompt` signature expansion
- [ ] ChatService greeting injection logic
- [ ] Service-layer Zod re-validation
- [ ] Type-level fixes (TD-2)
- [ ] Repository method additions (findByName, findUserCharactersPaginated)
- [ ] Unicode normalization helper

---

## Final Acceptance Protocol

When Phase 7.2 implementation is complete:

1. Run `npx tsc --noEmit` → must pass with 0 errors in character/chat code
2. Verify all A1-A7 checkboxes against code
3. Generate `docs/phase7/12-phase72-final-acceptance.md` with PASS/FAIL verdict per category
4. Overall PASS requires all A1-A7 categories to pass
5. A5 and A6 are design-only — accepted if design docs exist and are consistent