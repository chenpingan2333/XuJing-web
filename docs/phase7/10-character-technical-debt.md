# 10 — Character Technical Debt Audit

> **Phase 7.2 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation

---

## TD-1 — Service Layer Zod Validation

**Current State:**
- Route layer: `CreateCharacterSchema.safeParse(body)` → passes parsed data to service
- Route layer: `UpdateCharacterSchema.safeParse(body)` → passes parsed data to service
- Service layer: receives typed params but no re-validation
- Import: `ImportCharacterSchema.safeParse()` + `CreateCharacterSchema.parse(mapped)` in service (already in service)

**Problem:**
If a route handler is bypassed (e.g., internal call, background job, test), the service has no defense. The service trusts its caller blindly.

**Audit:**

| Method | Route Validation | Service Re-Validation |
|--------|-----------------|----------------------|
| createCharacter | CreateCharacterSchema.safeParse | ❌ None |
| updateCharacter | UpdateCharacterSchema.safeParse | ❌ None |
| importCharacter | ImportCharacterSchema.safeParse + CreateCharacterSchema.parse | ✅ Yes |
| getCharacter | None | ❌ None (id only) |
| listCharacters | None | ❌ None (auth only) |
| deleteCharacter | None | ❌ None (id + auth) |
| exportCharacter | None | ❌ None (id + auth) |

**Recommendation:**

```
Priority: MEDIUM — add to Phase 7.2 or 7.3

Option A (Lightweight):
  - Add `CreateCharacterSchema.parse(data)` at top of createCharacter
  - Add `UpdateCharacterSchema.parse(data)` at top of updateCharacter
  - Cost: ~5 lines each, no new dependencies

Option B (Defense-in-Depth):
  - Create `CharacterValidator` wrapper class
  - Single `validateCreate(input)`, `validateUpdate(input)` methods
  - Both route AND service call the same validator
  - Cost: new file, refactor route.ts

Recommendation: Option A — minimal, effective, no refactor risk.
```

---

## TD-2 — `as any` Cleanup Plan

**Location:** `src/server/services/character.service.ts:154`

```typescript
const created = await characterRepository.create({
  userId: auth.userId,
  name: data.name.trim(),
  // ... 14 fields ...
  isOfficial: false,
  version: 1,
} as any);  // ← This line
```

**Root Cause:**
`characterRepository.create()` expects `typeof characters.$inferInsert`. The Drizzle-inferred type has accurate types for each column (e.g., `dialogueExamples: unknown` for jsonb). Two mismatches cause `as any`:

1. **jsonb columns**: `dialogueExamples` and `extraFields` accept `unknown` in Drizzle's type, but we pass `string | null`. TypeScript strict mode rejects `string` assigned to `unknown` destination (actually `unknown` accepts anything — the issue is the reverse: Drizzle's `$inferInsert` for jsonb may be typed as `unknown` but the insertion function expects a narrower type internally).

2. **TEXT columns**: `groupGreeting`, `mainPrompt`, etc. are typed as `string | null` by Drizzle. Our `nullIfEmpty()` returns `unknown`, which fails strict assignment.

3. **Date columns**: `createdAt` and `updatedAt` have `$defaultFn()` so they're optional in `$inferInsert`, but the type system still expects `Date | null | undefined`.

**Cleanup Strategy:**

```
Step 1: Create a typed insert helper

  function toInsertData(data: {...}): typeof characters.$inferInsert {
    return {
      userId: data.userId,
      name: data.name,
      setting: data.setting,
      greeting: data.greeting,
      avatarUrl: data.avatarUrl ?? null,
      backgroundUrl: data.backgroundUrl ?? null,
      personality: data.personality ?? null,
      scenario: data.scenario ?? null,
      dialogueExamples: data.dialogueExamples ?? null,
      nickname: data.nickname ?? null,
      groupGreeting: data.groupGreeting ?? null,
      mainPrompt: data.mainPrompt ?? null,
      postHistoryInstructions: data.postHistoryInstructions ?? null,
      extraFields: data.extraFields ?? null,
      isOfficial: data.isOfficial ?? false,
      version: data.version ?? 1,
    };
  }

Step 2: Replace `as any` with `toInsertData(...)`

  - Line 154: `as any` → call toInsertData()
  - Verify types pass without `as any`

Step 3: Update `nullIfEmpty` return type

  - `nullIfEmpty(value: unknown): string | null` for text fields
  - `nullIfEmpty(value: unknown): unknown` for jsonb fields

Priority: HIGH — eliminate type-safety hole.
Estimated effort: 30 minutes.
Risk: Low — purely type-level change, no runtime behavior change.
```

---

## TD-3 — Unicode Normalization for Name Check

**Current State:** `character.service.ts:105-118`

```typescript
const lower = trimmed.toLowerCase();
const duplicate = chars.find(
  (c) => c.name.trim().toLowerCase() === lower && c.id !== excludeId,
);
```

**Problem:**
`.toLowerCase()` only handles ASCII case folding. Unicode characters (CJK, Latin-with-diacritics, fullwidth forms) are not normalized:

| Input A | Input B | `.toLowerCase()` Match? | Should Match? |
|---------|---------|------------------------|---------------|
| Alice | alice | ✅ Yes | ✅ Yes |
| Ａｌｉｃｅ (fullwidth) | Alice | ❌ No | ✅ Yes |
| Müller | mueller | ❌ No | ✅ Yes (NFKD) |
| Café | cafe | ❌ No | ✅ Yes |
| アリス | ｱﾘｽ (halfwidth) | ❌ No | ✅ Yes |

**Recommendation:**

```
Priority: LOW — edge case for international users

Solution: Normalize to NFKC before comparison

  function normalizeForComparison(s: string): string {
    return s.trim().normalize("NFKC").toLowerCase();
  }

  // Replace all `c.name.trim().toLowerCase()` with `normalizeForComparison(c.name)`

NFKC benefits:
  - Fullwidth → halfwidth: Ａ → A, ａ → a
  - Compatibility decomposition: ﬁ → fi, ㎏ → kg
  - Case folding via toLowerCase() after normalization

Cost: ~5 lines, zero dependencies. String.prototype.normalize() is ES2015.
```

---

## TD-4 — Database-Level Duplicate Name Check

**Current State:** `character.service.ts:105-118`

```typescript
const chars = await characterRepository.findUserCharacters(userId);
const duplicate = chars.find(
  (c) => c.name.trim().toLowerCase() === lower && c.id !== excludeId,
);
```

**Problem:**
`findUserCharacters()` loads ALL user characters into memory to check for duplicate names. At FREE tier (max 12), this is negligible. But at scale with VIP users (unlimited), this becomes O(n) in application memory + O(n) network transfer.

**Current Repository:** No `findByName` method exists.

**Recommendation:**

```
Priority: LOW — premature optimization for current scale (FREE ≤12)

Add to CharacterRepository:

  async findByName(userId: string, normalizedName: string) {
    return db.query.characters.findFirst({
      where: and(
        eq(characters.userId, userId),
        isNull(characters.deletedAt),
        sql`LOWER(TRIM(${characters.name})) = ${normalizedName}`
      ),
    });
  }

Then simplify service:

  async checkDuplicateName(userId, name, excludeId?) {
    const lower = normalizeForComparison(name); // from TD-3
    const existing = await characterRepository.findByName(userId, lower);
    if (existing && existing.id !== excludeId) {
      throw new CharacterError("CHARACTER_DUPLICATE_NAME", ...);
    }
  }

Benefits:
  - O(1) query instead of O(n) memory scan
  - Database-level case-insensitive comparison via SQL LOWER()
  - Works with PostgreSQL index: CREATE INDEX idx_characters_name_lower
    ON characters (user_id, LOWER(TRIM(name))) WHERE deleted_at IS NULL;

Cost: 1 new Repository method + 1 new DB index (optional).
```

---

## TD-5 — Rate Limit Architecture

**Current State:** `src/app/api/_base/rate-limit.ts`
- In-memory Map-based sliding window
- Per-user, per-action tracking
- `setInterval` cleanup every 60s

**Limitations:**

| Concern | Impact |
|---------|--------|
| Memory-only | Lost on server restart — all rate limits reset |
| Single-process | Not shared across multiple Node.js instances (cluster/PM2) |
| No persistence | Cannot enforce limits across deployments |
| No observability | No metrics on rate-limit hits |

**Options:**

| Solution | Persistence | Shared | Complexity | Cost |
|----------|------------|--------|------------|------|
| **Current (Memory)** | ❌ | ❌ | Zero | Free |
| **Redis (ioredis)** | ✅ | ✅ | Low | Self-hosted or $0 (Upstash free tier) |
| **Upstash Redis** | ✅ | ✅ | Low | Free tier: 10K commands/day |
| **Cloudflare KV** | ✅ | ✅ | Medium | Free tier: 100K reads/day |

**Recommendation:**

```
Priority: LOW — current in-memory solution is adequate for MVP

Phase 1 (current): In-memory Map — sufficient for single-instance dev/production
Phase 2 (future): Redis via ioredis (already a project dependency)

Redis implementation sketch:

  async function rateLimit(userId, action, config, subscription): Promise<Response|null> {
    const tier = subscription === "vip" ? config.vip : config.free;
    const key = `ratelimit:${userId}:${action}`;
    const now = Date.now();

    // Atomic: remove old + add new + count
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      local count = redis.call('ZCARD', key)
      if count >= limit then return 0 end
      redis.call('ZADD', key, now, now .. '-' .. count)
      redis.call('EXPIRE', key, math.ceil(window / 1000))
      return 1
    `;
    const ok = await redis.eval(script, [key], [now, tier.windowMs, tier.limit]);
    return ok === 0 ? jsonErr("操作过于频繁，请稍后再试", 429) : null;
  }

Benefit: Atomic Lua script — no race condition.
```

---

## TD-6 — Pagination Design

**Current State:**
- `GET /api/characters` returns all official + all user characters
- No pagination, no cursor, no limit/offset

**Problem:**
VIP users with many characters will get increasingly large responses. The frontend renders all cards in a 2-column grid — at 50+ characters, this is a UX issue.

**Target API Design:**

```
GET /api/characters?type=user&limit=20&cursor=xxx
GET /api/characters?type=official&limit=20&cursor=xxx

Response:
{
  success: true,
  data: {
    official: [...],
    user: {
      items: [...],
      nextCursor: "character-id-abc" | null,
      total: 45
    }
  }
}
```

**Cursor Strategy:** Use `createdAt DESC` with cursor-based pagination:

```
WHERE (created_at, id) < (cursor_created_at, cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20
```

**Recommendation:**

```
Priority: LOW — current scale (FREE ≤12) doesn't need pagination

Phase 1 (current): Full list — adequate for MVP
Phase 2 (future): Cursor-based pagination on user characters only
  - Official characters: keep full list (small, fixed set)
  - User characters: paginate with limit=20, cursor-based

Repository additions:
  - findUserCharactersPaginated(userId, limit, cursor)
  - countUserCharacters (already exists)

Frontend changes:
  - Infinite scroll or "Load more" button on character grid
  - Keep 2-column grid layout
```

---

## Summary

| ID | Item | Priority | Phase | Effort |
|----|------|----------|-------|--------|
| TD-1 | Service Layer Zod Re-Validation | MEDIUM | 7.2/7.3 | 30 min |
| TD-2 | `as any` Cleanup | HIGH | 7.2 | 30 min |
| TD-3 | Unicode Normalization | LOW | 7.3 | 15 min |
| TD-4 | DB-Level Name Check | LOW | 7.3 | 30 min |
| TD-5 | Redis Rate Limiter | LOW | Post-MVP | 2 hr |
| TD-6 | Pagination | LOW | Post-MVP | 4 hr |