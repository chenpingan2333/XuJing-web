# 08 — Phase 7.1 Hardening Report

> **Phase 7.1 Final Hardening** | **Date**: 2026-06-08
> **TypeScript**: PASS — 0 errors in hardened code

---

## Build Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** — Only pre-existing test-file errors; 0 errors in character code |

---

## Hardening Fixes

### H1 — getCharacter() Permission Fix

**File**: `src/server/services/character.service.ts:205-216`

```typescript
async getCharacter(auth: AuthUser, characterId: string) {
  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    throw new CharacterError("CHARACTER_NOT_FOUND", "角色不存在", 404);
  }
  // Non-official + not owned → 403
  if (!character.isOfficial && character.userId !== auth.userId) {
    throw new CharacterError("CHARACTER_NOT_OWNED", "无权查看此角色", 403);
  }
  return character;
}
```

| Rule | Before | After |
|------|--------|-------|
| Official character | Allow view | Allow view |
| Own character | Allow view | Allow view |
| Other user's character | Allow view | **403 CHARACTER_NOT_OWNED** |

---

### H2 — Case-Insensitive Name Check

**File**: `src/server/services/character.service.ts:105-118`

```typescript
const lower = trimmed.toLowerCase();
const duplicate = chars.find(
  (c) => c.name.trim().toLowerCase() === lower && c.id !== excludeId,
);
```

| Input | Behaviour |
|-------|-----------|
| Alice / alice | Treated as same |
| Alice / Alice | Treated as same |
| Alice / ALICE | Treated as same |
| Alice / Bob | Allowed |

---

### H3 — Import Zod Chain

**File**: `src/server/services/character.service.ts:270-330`

All imports now go through `ImportCharacterSchema.safeParse()` → format detection → field mapping → `CreateCharacterSchema.parse()`.

```
Request Body
    │
    ▼
ImportCharacterSchema.safeParse()   ← Zod union (Xujing | Tavern v2)
    │
    ▼
Format detection ("spec" in data)
    │
    ├─ Tavern v2 → field mapping
    └─ Xujing → field mapping
    │
    ▼
CreateCharacterSchema.parse(mapped)  ← 二次 Zod 校验字段限制
    │
    ▼
characterService.createCharacter()
```

> Before: importCharacter used manual detection + manual validation (no Zod).
> After: unified Zod chain — `ImportCharacterSchema` for format + `CreateCharacterSchema` for field limits.

---

### H4 — Import File Size Limit

**New file**: `src/app/api/characters/import/route.ts`

| Rule | Value |
|------|-------|
| Max payload | 5 MB |
| Check method | `TextEncoder().encode(rawText).length` before `JSON.parse` |
| Exceeded response | `413 — 导入文件过大（最大 5 MB）` |
| Rate limit | FREE=3/min, VIP=10/min |

Route: `POST /api/characters/import`

---

### H5 — Avatar Upload Fix

**Files**: `src/app/characters/new/page.tsx`, `src/app/characters/[id]/page.tsx`

| Before | After |
|--------|-------|
| `FileReader.readAsDataURL()` → set both preview AND `avatarUrl` state | Preview only; `avatar_url` field stays empty |
| Base64 string submitted as `avatar_url` | Only valid URL accepted (validated by Zod `.url()`) |
| No upload endpoint | TODO comment: `// TODO: Phase 7.2 — 实现头像上传服务` |

```typescript
// Before (broken):
reader.onload = () => {
  setAvatarPreview(reader.result as string);
  setAvatarUrl(reader.result as string);  // ❌ base64 data URL
};

// After (fixed):
reader.onload = () => {
  setAvatarPreview(reader.result as string);
  // avatar_url remains empty; must use upload service for real URL
};
```

---

### H6 — dialogue_examples jsonb Compatibility

**File**: `src/server/services/character.service.ts:31-35`

```typescript
/** jsonb 列不接受空字符串，统一转为 null */
function nullIfEmpty(value: unknown): unknown {
  if (value === "" || value === undefined) return null;
  return value;
}
```

All text fields mapping to jsonb columns (`dialogueExamples`, `extraFields`) pass through `nullIfEmpty()`. Empty strings become SQL NULL, preventing type mismatch in PostgreSQL jsonb columns.

---

### H7 — API Rate Limiting

**New file**: `src/app/api/_base/rate-limit.ts`

In-memory sliding window rate limiter with per-user, per-action tracking.

**Applied to all Character API routes:**

| Route | Method | FREE | VIP |
|-------|--------|------|-----|
| `/api/characters` | GET (list) | 30/min | 60/min |
| `/api/characters` | POST (create) | 5/min | 20/min |
| `/api/characters/:id` | GET (detail) | 30/min | 60/min |
| `/api/characters/:id` | PUT (update) | 10/min | 30/min |
| `/api/characters/:id` | DELETE | 5/min | 10/min |
| `/api/characters/import` | POST | 3/min | 10/min |
| `/api/characters/:id/export` | GET | 10/min | 20/min |

Rate limit exceeded → `429 — 操作过于频繁，请稍后再试`

---

### H8 — Route Audit

All 6 Character API routes verified:

| Route | requireAuth | Rate Limit | CharacterError → jsonErr | No Stack Trace |
|-------|-------------|------------|--------------------------|----------------|
| `GET /api/characters` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/characters` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/characters/:id` | ✅ | ✅ | ✅ | ✅ |
| `PUT /api/characters/:id` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /api/characters/:id` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/characters/:id/export` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/characters/import` | ✅ | ✅ | ✅ | ✅ |

---

## Files Modified

| # | File | Change |
|---|------|--------|
| 1 | `src/server/services/character.service.ts` | H1 (getCharacter), H2 (case-insensitive), H3 (import Zod chain), H6 (nullIfEmpty + jsonb compat) |
| 2 | `src/app/api/characters/route.ts` | H7 (rate limits) |
| 3 | `src/app/api/characters/[id]/route.ts` | H7 (rate limits) |
| 4 | `src/app/api/characters/[id]/export/route.ts` | H7 (rate limits) |
| 5 | `src/app/characters/new/page.tsx` | H5 (avatar base64 fix) |
| 6 | `src/app/characters/[id]/page.tsx` | H5 (avatar base64 fix) |

## Files Created

| # | File | Change |
|---|------|--------|
| 7 | `src/app/api/characters/import/route.ts` | H4 (import route with 5MB limit) |
| 8 | `src/app/api/_base/rate-limit.ts` | H7 (in-memory rate limiter) |

## Unmodified

- `src/db/schema/characters.ts` — unchanged
- `src/server/repositories/character.repository.ts` — unchanged
- `src/app/api/characters/validations.ts` — unchanged
- All auth, chat, provider-gateway modules — unchanged

---

## Final File Tree

```
src/
├── app/
│   ├── api/
│   │   ├── _base/
│   │   │   ├── auth.ts
│   │   │   ├── response.ts
│   │   │   └── rate-limit.ts            ✅ NEW (H7)
│   │   └── characters/
│   │       ├── validations.ts
│   │       ├── route.ts                 ✅ MODIFIED (H7)
│   │       ├── import/
│   │       │   └── route.ts             ✅ NEW (H4)
│   │       └── [id]/
│   │           ├── route.ts             ✅ MODIFIED (H7)
│   │           └── export/
│   │               └── route.ts         ✅ MODIFIED (H7)
│   └── characters/
│       ├── page.tsx
│       ├── new/
│       │   └── page.tsx                 ✅ MODIFIED (H5)
│       └── [id]/
│           └── page.tsx                 ✅ MODIFIED (H5)
└── server/
    └── services/
        └── character.service.ts         ✅ MODIFIED (H1,H2,H3,H6)
```