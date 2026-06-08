# 02 — Character Schema Review

> **Phase 7 Design Freeze** | **Date**: 2026-06-07
> **Status**: Audit Only — No Schema Changes

---

## 1. Current Database Audit

### 1.1 characters Table (Existing)

| Column | Type | Constraint | Assessment |
|--------|------|------------|------------|
| id | uuid | PK, UUID v7 | REUSE — Perfect |
| user_id | uuid | FK -> users, nullable | REUSE — NULL for official |
| name | varchar(100) | NOT NULL | REUSE — Matches spec |
| avatar_url | varchar(500) | nullable | REUSE — Matches spec |
| background_url | varchar(500) | nullable | REUSE — Chat background |
| setting | text | NOT NULL | REUSE — Maps to description field |
| greeting | text | NOT NULL | REUSE — Opening message |
| personality | text | nullable | REUSE — Matches spec |
| scenario | text | nullable | REUSE — Matches spec |
| dialogue_examples | jsonb | nullable | REUSE — Maps to exampleDialogue |
| nickname | varchar(100) | nullable | REUSE — Matches spec |
| group_greeting | text | nullable | REUSE — Matches spec |
| main_prompt | text | nullable | REUSE — Matches spec |
| post_history_instructions | text | nullable | REUSE — Matches spec |
| extra_fields | jsonb | nullable | REUSE — Extension point |
| is_official | boolean | NOT NULL, default false | REUSE — Official flag |
| version | integer | NOT NULL, default 1 | REUSE — Edit counter |
| deleted_at | timestamptz | nullable | REUSE — Soft delete |
| created_at | timestamptz | NOT NULL | REUSE — Creation time |
| updated_at | timestamptz | NOT NULL | REUSE — Update time |

### 1.2 Existing Indexes

| Index | Type | Assessment |
|-------|------|------------|
| idx_characters_user_id | B-tree ON user_id | REUSE — List user characters |
| idx_characters_is_official | B-tree ON is_official | REUSE — Filter official |
| idx_characters_active | Partial ON user_id WHERE deleted_at IS NULL AND user_id IS NOT NULL | REUSE — Active user characters |

### 1.3 Existing Relations

| Relation | Assessment |
|----------|------------|
| characters -> users (owner) | REUSE — userId FK |
| characters -> messages | REUSE — One-to-many, CASCADE |
| characters -> memories | REUSE — One-to-many, CASCADE |

### 1.4 Existing Repository Methods

| Method | Assessment |
|--------|------------|
| findById(id) | REUSE — Get single character |
| findOfficial() | REUSE — List official characters |
| findUserCharacters(userId) | REUSE — List user characters |
| countUserCharacters(userId) | REUSE — Quota check |
| create(data) | REUSE — Create character |
| update(id, data) | REUSE — Update character |
| softDelete(id) | REUSE — Soft delete |
| duplicate(id, userId) | REUSE — Copy character |

---

## 2. Schema Audit Results

### 2.1 Can Be Reused Directly

| # | Asset | Type |
|---|-------|------|
| 1 | characters table (18 columns) | Table |
| 2 | idx_characters_user_id | Index |
| 3 | idx_characters_is_official | Index |
| 4 | idx_characters_active | Index |
| 5 | CharacterRepository (8 methods) | Repository |
| 6 | Character type (Drizzle inferred) | Type |

### 2.2 Must Be Added

| # | Asset | Reason |
|---|-------|--------|
| — | NONE | Existing schema covers all MVP requirements |

> The current characters table already has every field specified in the Phase 7 Character Editor Specification.
> Field mapping: setting = description, dialogue_examples = exampleDialogue.
> All text fields use PostgreSQL TEXT type — automatically supports 10,000+ characters.

### 2.3 Must Be Deleted

| # | Asset | Reason |
|---|-------|--------|
| — | NONE | No redundant columns |

---

## 3. Missing Tables Audit

| Table | Exists? | MVP Need | Notes |
|-------|---------|----------|-------|
| characters | YES | Required | Complete |
| character_tags | NO | Not needed | Tags can be stored in extra_fields JSONB |
| worlds | NO | Not needed | MVP uses scenario field instead |
| character_memory | NO | Already covered | memories table handles (characterId, userId) pairs |

> char_tags / worlds / character_memory tables are NOT needed for MVP. The existing schema is sufficient.

---

## 4. Field Type Verification

### 4.1 TEXT vs VARCHAR Audit

| Field | Current Type | Spec Requirement | Compliant? |
|-------|-------------|------------------|------------|
| setting (description) | text | >= 10,000 chars | YES — TEXT unlimited |
| greeting | text | >= 10,000 chars | YES — TEXT unlimited |
| personality | text | >= 10,000 chars | YES — TEXT unlimited |
| scenario | text | >= 10,000 chars | YES — TEXT unlimited |
| main_prompt | text | >= 10,000 chars | YES — TEXT unlimited |
| post_history_instructions | text | >= 10,000 chars | YES — TEXT unlimited |
| group_greeting | text | >= 10,000 chars | YES — TEXT unlimited |
| dialogue_examples | jsonb | >= 50,000 chars | YES — JSONB 1GB limit |

> All fields use PostgreSQL TEXT (unlimited) — NOT VARCHAR(10000). Fully compliant.

---

## 5. Conclusion

**Verdict: NO SCHEMA CHANGES NEEDED.**

The existing characters table (V1.2) already contains every field required by the Phase 7 Character Editor Specification. All text fields use TEXT type. All indexes are appropriately designed. All repository methods cover the needed operations.

Phase 7.1 implementation can proceed directly with the existing schema.