# 03 — Character Page Design

> **Phase 7 Design Freeze** | **Updated**: 2026-06-08

## 1. Page Map

| Route | Page | Auth |
|-------|------|------|
| /characters | Character list | Required |
| /characters/new | Create character | Required |
| /characters/[id] | Edit character | Required + ownership |

## 2. /characters — Character List

Top: header with back arrow, Characters title, [+ New] button, [Import] button.
Body: official characters section (if any), user characters section as card grid.
Each card: avatar, name, [Official] badge or memory count.
Bottom: quota display (FREE: N/12, VIP: N unlimited).
Nav: Characters, Chat, Shop, Me tabs.

### States
- Logged out: email login form
- FREE + 0 chars: empty state, [+ New] button, 0/12
- FREE + N chars: cards + quota N/12, [+ New] disabled at 12
- VIP: cards + unlimited quota

## 3. /characters/new — Create Character

Form fields (top to bottom):

**Basic Info** (always visible):
1. Avatar — Image upload, optional, max 10MB, jpg/png/webp
2. Name — Text, required, max 10 Chinese chars, char counter (0/10)
3. Setting — Textarea, required, max 10000 chars, supports markdown, char counter (0/10000)
4. Greeting — Textarea, required, max 200 chars, supports `<START>` separator, char counter (0/200)

**Advanced** (collapsed):
5. Personality — Textarea, optional, max 10000 chars, char counter (0/10000)
6. Scenario — Textarea, optional, max 10000 chars, char counter (0/10000)
7. Example Dialogues — Textarea, optional, max 500 chars, Tavern format (`{{char}}:` / `{{user}}:`), char counter (0/500)

**Extended Fields** (collapsed, sub-page):
8. Nickname — Text, optional, max 10 Chinese chars, char counter (0/10)
9. Group Greeting — Textarea, optional, max 200 chars, char counter (0/200), stored only, not used in chat

**System Instructions** (collapsed, sub-page):
10. Main Prompt — Textarea, optional, max 10000 chars, supports `{{original}}`, char counter (0/10000)
11. Post History Instructions — Textarea, optional, max 10000 chars, supports `{{original}}`, char counter (0/10000)

### UI Rules
- All text fields show char counter: current / max
- Input disabled when max reached
- Placeholder text floats; disappears on input
- All collapsed sections default closed
- Save button at page bottom, fixed; disabled until name + setting + greeting filled
- Avatar shows preview after selection

## 4. /characters/[id] — Edit Character

Same form as /characters/new, pre-populated. Title: Edit Character.
Additional actions: [Export JSON], [Delete Character] (red, with confirmation).

### Delete Flow
1. Tap [Delete Character]
2. Confirmation dialog: Are you sure? This cannot be undone.
3. [Cancel] [Confirm Delete]
4. DELETE /api/characters/[id], navigate to /characters

### Import Flow
1. Tap [Import] on /characters page
2. File picker, .json filter
3. Parse and validate JSON
4. Preview card
5. Confirm import -> POST /api/characters/import
6. Navigate to /characters/[newId]

## 5. FREE Constraints
- Max 12 characters (official not counted)
- [+ New] disabled at 12
- Import blocked at limit

## 6. VIP Display
- No character limit
- Memory: 10000 per character
- Premium styling

## 7. Constraints
- Official chars: not editable, not deletable
- Characters never bind Provider/API Key/Model
- Provider is account-level, fully decoupled
- group_greeting: stored only, not connected to any chat or prompt system in current version

## 8. Field Limits Summary

| # | Field | Required | Max Length | UI Counter |
|---|-------|----------|------------|------------|
| 1 | name | YES | 10 | 0/10 |
| 2 | setting | YES | 10000 | 0/10000 |
| 3 | greeting | YES | 200 | 0/200 |
| 4 | avatar_url | NO | 500 | — |
| 5 | background_url | NO | 500 | — |
| 6 | personality | NO | 10000 | 0/10000 |
| 7 | scenario | NO | 10000 | 0/10000 |
| 8 | dialogue_examples | NO | 500 | 0/500 |
| 9 | nickname | NO | 10 | 0/10 |
| 10 | group_greeting | NO | 200 | 0/200 |
| 11 | main_prompt | NO | 10000 | 0/10000 |
| 12 | post_history_instructions | NO | 10000 | 0/10000 |

### Design Principle
- Character setting content: long text OK (10000 chars)
- System prompt content: long text OK (10000 chars)
- User-facing display content: short text (name ≤10, nickname ≤10, greeting ≤200, group_greeting ≤200, dialogue_examples ≤500)
- Rationale: prevent users from creating excessively long opening messages or examples that waste tokens

## 9. Navigation
| From | To | Trigger |
|------|-----|---------|
| Nav [Characters] | /characters | Tab tap |
| Card tap | /characters/[id] | Card tap |
| [+ New] | /characters/new | Button tap |
| [Import] | File picker | Button tap |
| [Save] | /characters | Save success |
| [Export] | File download | Button tap |
| [Delete] -> confirm | /characters | Delete success |