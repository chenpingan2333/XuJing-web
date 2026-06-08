# 04 — Character Routing & Flow

> **Phase 7 Design Freeze** | **Date**: 2026-06-07

---

## 1. Character Creation Flow

`mermaid
flowchart TD
  A[User on /characters] --> B{Tap [+ New]}
  B --> C{FREE quota check}
  C -->|At limit 12/12| D[Show error: Max characters reached]
  C -->|Available| E[Open /characters/new form]
  E --> F[User fills: name, setting, greeting]
  F --> G{Tap [Save]}
  G --> H{Client validation}
  H -->|Fail| I[Highlight invalid fields]
  H -->|Pass| J[POST /api/characters]
  J --> K{Server validation}
  K -->|Fail| L[Return validation error]
  K -->|Success| M[Navigate to /characters]
  M --> N[List refreshes with new character]
`

## 2. Character Edit Flow

`mermaid
flowchart TD
  A[User on /characters] --> B{Tap character card}
  B --> C[GET /api/characters/[id]]
  C --> D{Ownership check}
  D -->|Not owned| E[403: Unauthorized]
  D -->|Owned| F[Show /characters/[id] edit form]
  F --> G[Form pre-populated with existing data]
  G --> H[User modifies fields]
  H --> I{Tap [Save]}
  I --> J{Client validation}
  J -->|Fail| K[Highlight invalid fields]
  J -->|Pass| L[PUT /api/characters/[id]]
  L --> M{Server validation + ownership}
  M -->|Fail| N[Return error]
  M -->|Success| O[version++, show success toast]
`

## 3. Character Delete Flow

`mermaid
flowchart TD
  A[User on /characters/[id]] --> B{Tap [Delete Character]}
  B --> C[Show confirmation dialog]
  C --> D{Tap [Cancel]}
  D --> E[Close dialog, stay on page]
  C --> F{Tap [Confirm Delete]}
  F --> G{DELETE /api/characters/[id]}
  G --> H{Ownership + !isOfficial}
  H -->|Blocked| I[403: Cannot delete official or not owned]
  H -->|Allowed| J[Soft delete: set deletedAt=now()]
  J --> K[Navigate to /characters]
  K --> L[List refreshes without deleted character]
`

## 4. Character Export Flow

`mermaid
flowchart TD
  A[User on /characters/[id]] --> B{Tap [Export JSON]}
  B --> C{Ownership + !isOfficial}
  C -->|Blocked| D[403 Error]
  C -->|Allowed| E[GET /api/characters/[id]/export]
  E --> F[Server returns JSON character card]
  F --> G[Browser downloads .json file]
`

## 5. Character Import Flow

`mermaid
flowchart TD
  A[User on /characters] --> B{Tap [Import]}
  B --> C{FREE quota check}
  C -->|At limit| D[Show error: Max characters reached]
  C -->|Available| E[Open file picker, filter .json]
  E --> F[User selects .json file]
  F --> G[Client parses JSON]
  G --> H{Valid character card?}
  H -->|No| I[Show validation error]
  H -->|Yes| J[Show preview card]
  J --> K{Tap [Confirm Import]}
  K --> L[POST /api/characters/import]
  L --> M{Server validation + quota}
  M -->|Fail| N[Return error]
  M -->|Success| O[Navigate to /characters/[newId]]
`

## 6. Official Character Browse Flow

`mermaid
flowchart TD
  A[User on /characters] --> B[GET /api/characters?type=official]
  B --> C[Returns isOfficial=true, userId=NULL characters]
  C --> D[Display in Official Characters section]
  D --> E{Tap official character card}
  E --> F[GET /api/characters/[id]]
  F --> G[Show read-only preview]
  G --> H{Is owner?}
  H -->|No| I[Hide Edit/Delete/Export buttons]
  H -->|N/A official| I
`

## 7. Permission Check Flow

`mermaid
flowchart TD
  A[API Request] --> B{Auth middleware}
  B -->|No token| C[401: Authentication required]
  B -->|Valid token| D{Token valid + JTI not blacklisted?}
  D -->|No| E[401: Invalid or expired]
  D -->|Yes| F[Route handler]
  F --> G{Operation type}
  G -->|CREATE| H{Under quota?}
  H -->|No + FREE| I[403: Max 12 characters]
  H -->|Yes + FREE, or VIP| J[Create with userId=auth.userId]
  G -->|UPDATE/DELETE/EXPORT| K{char.userId === auth.userId?}
  K -->|No| L[403: Not authorized]
  K -->|Yes| M{isOfficial?}
  M -->|Yes| N[403: Cannot modify official character]
  M -->|No| O[Perform operation]
  G -->|IMPORT| P{Under quota?}
  P -->|No + FREE| I
  P -->|Yes or VIP| Q[Create with imported data + auth.userId]
`

---

## 8. API Route Matrix

| Method | Route | Auth | Ownership | Description |
|--------|-------|------|-----------|-------------|
| GET | /api/characters | YES | — | List user+official characters |
| POST | /api/characters | YES | — | Create character |
| GET | /api/characters/[id] | YES | Optional | Get single character |
| PUT | /api/characters/[id] | YES | YES + !official | Update character |
| DELETE | /api/characters/[id] | YES | YES + !official | Soft delete character |
| GET | /api/characters/[id]/export | YES | YES + !official | Export character JSON |
| POST | /api/characters/import | YES | — | Import character from JSON |

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Characters never reference Provider/Key/Model | Provider is account-level; fully decoupled |
| setting = description (in DB) | Matches existing schema; no migration needed |
| dialogue_examples = jsonb | Flexible structure for example dialogues |
| Official = isOfficial=true AND userId=NULL | Clean separation; no need for createdBy column |
| Soft delete via deletedAt | Recoverable; quota released on delete |
| Version counter on edit | Enables future conflict resolution |