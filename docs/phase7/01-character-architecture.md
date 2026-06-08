# 01 — Character Architecture

> **Phase 7 Design Freeze** | **Date**: 2026-06-07
> **Status**: Frozen

---

## 1. Character Domain Model

### 1.1 Entity Definition

| Attribute | DB Column | Type | Required | Notes |
|-----------|-----------|------|----------|-------|
| id | id | UUID v7 PK | auto | Unique identifier |
| userId | user_id | UUID FK->users | — | NULL=official, NOT NULL=user |
| name | name | varchar(100) | YES | Character name |
| avatarUrl | avatar_url | varchar(500) | NO | Avatar image URL |
| backgroundUrl | background_url | varchar(500) | NO | Chat background URL |
| setting | setting | text | YES | Character description/persona |
| greeting | greeting | text | YES | Opening message(s) |
| personality | personality | text | NO | Personality traits |
| scenario | scenario | text | NO | Scenario context |
| dialogueExamples | dialogue_examples | jsonb | NO | Example dialogues |
| nickname | nickname | varchar(100) | NO | Alternate name |
| groupGreeting | group_greeting | text | NO | Group chat greeting |
| mainPrompt | main_prompt | text | NO | Custom main prompt |
| postHistoryInstructions | post_history_instructions | text | NO | Post-history rules |
| extraFields | extra_fields | jsonb | NO | Extension fields |
| isOfficial | is_official | boolean | auto | Official character flag |
| version | version | integer | auto | Edit version counter |
| deletedAt | deleted_at | timestamptz | — | Soft-delete marker |
| createdAt | created_at | timestamptz | auto | Creation timestamp |
| updatedAt | updated_at | timestamptz | auto | Last update timestamp |

### 1.2 Classification

| Type | userId | isOfficial | Source | Editable | Deletable |
|------|--------|------------|--------|----------|-----------|
| Official | NULL | true | System preset | NO | NO |
| User | NOT NULL | false | User created/imported | YES | YES |

> No createdBy field. Official = isOfficial=true AND userId=NULL. User = userId IS NOT NULL.

### 1.3 State Machine

`
[Create] -> ACTIVE --> [Soft Delete] -> DELETED (deletedAt NOT NULL)
  |                       |
  +-- [Edit]              +-- Hidden from queries
  +-- [Export]            +-- Physical cleanup TBD (30 days)
  +-- [Chat]
`

---

## 2. Character Lifecycle

### 2.1 Create
- FREE user: max 12 characters (excluding official)
- VIP user: unlimited
- Required fields: name, setting, greeting
- Initial version = 1

### 2.2 Edit
- Only editable when userId === auth.userId
- Official characters are immutable
- Version increments on each edit

### 2.3 Delete
- Soft delete: set deletedAt = now()
- Messages and memories cascade
- FREE user quota released on delete

### 2.4 Export
- Format: JSON (Xujing character card)
- Excludes: id, userId, deletedAt, isOfficial

### 2.5 Import
- Supported formats: Xujing, Tavern, SillyTavern character cards
- New UUID v7 generated on import
- userId set to importing user

---

## 3. Character <-> User

- User (1) ---- (N) Character
- FREE: <= 12 characters (official not counted)
- VIP: unlimited
- Official characters (userId=NULL) visible to all, not counted in quota

## 4. Character <-> Chat

- Character (1) ---- (N) Message
- One chat = one (user, character) pair
- No multi-character group chat (MVP)
- Provider is account-level, NOT character-level
- Character NEVER binds Provider / API Key / Model

## 5. Character <-> Memory

- Character (1) ---- (N) Memory
- FREE: 100 memories per character
- VIP: 10,000 memories per character
- Memories cascade on character deletion

## 6. Character <-> World

Not implemented in MVP. scenario field provides per-character context.

---

## 7. Permission Model

| Operation | Condition | Error |
|-----------|-----------|-------|
| List characters | Authenticated | 401 |
| View official | All authenticated | — |
| View own | userId === auth.userId | — |
| Create | Auth + under quota | 403 |
| Edit | userId === auth.userId + !isOfficial | 403 |
| Delete | userId === auth.userId + !isOfficial | 403 |
| Export | userId === auth.userId + !isOfficial | 403 |
| Import | Auth + under quota | 403 |

### Cross-User Isolation
All mutations MUST check: character.userId === auth.userId

---

## 8. Integration Boundaries

| Point | Direction | Status |
|-------|-----------|--------|
| characters table | Consume | Existing |
| CharacterRepository | Consume | Existing |
| messages table | Indirect (CASCADE) | Existing |
| memories table | Indirect (CASCADE) | Existing |
| ChatService | Consumer | DO NOT MODIFY |
| Auth middleware | Passive | Existing |
| ProviderGateway | UNRELATED | Fully decoupled |
| ApiConfig | UNRELATED | Fully decoupled |