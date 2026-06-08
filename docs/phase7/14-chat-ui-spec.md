# 14 — Chat UI Specification

> **Phase 8 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation

---

## 1. Page Route

`/chat/[characterId]`

---

## 2. Full-Page Layout

```
┌──────────────────────────────────────┐
│ ← 角色名称               ⋮ (菜单)    │  Header (fixed top, 56px)
├──────────────────────────────────────┤
│                                      │
│  ┌─────────────────────────────┐     │
│  │ 🤖 你好！我是...            │     │
│  └─────────────────────────────┘     │
│                                      │
│         ┌───────────────────┐        │
│         │    用户的消息      │        │  MessageList (scrollable, flex-1)
│         └───────────────────┘        │
│                                      │
│  ┌─────────────────────────────┐     │
│  │ 🤖 这是角色回复... █        │     │  ← streaming
│  └─────────────────────────────┘     │
│                                      │
│  [建议1] [建议2] [建议3]             │  SuggestedReplies (horizontal scroll)
├──────────────────────────────────────┤
│ ┌────────────────────────┐  [➤]     │  InputBar (fixed bottom, 64px)
│ │ 输入消息...             │          │
│ └────────────────────────┘           │
└──────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1 CharacterHeader

```
Props:
  character: { name: string, avatarUrl?: string, isOfficial: boolean }
  onBack: () => void
  onMenuAction: (action: "regenerate" | "suggest" | "clear") => void

Layout:
  ← Back button (chevron left)
  Avatar (40px circle, first-char fallback)
  Name (14px semibold)
  Spacer
  Menu button (⋯, opens action sheet)

States:
  Official character → blue "官方" badge after name
  Avatar missing → gray circle with first char of name
```

### 3.2 MessageList

```
Props:
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  character: { avatarUrl?: string, name: string }

Behavior:
  - Auto-scroll to bottom on new message
  - Pause auto-scroll if user scrolled up >100px
  - "Scroll to bottom" FAB when scrolled up
  - Pull down to load earlier messages (future)

Empty state:
  - If character.greeting: show greeting bubble
  - Otherwise: centered text "开始对话吧"
  - Subtle animation: fade in
```

### 3.3 MessageBubble

**User Bubble:**
```
Styles:
  - align-self: flex-end
  - background: bg-gray-100
  - border-radius: rounded-2xl rounded-br-md
  - max-width: 75%
  - padding: 12px 16px
  - text: 14px, text-gray-900
  
Timestamp:
  - 12px, text-gray-400
  - Format: HH:mm
  - Below content, right-aligned
```

**Assistant Bubble:**
```
Styles:
  - align-self: flex-start
  - background: bg-white border border-gray-100
  - border-radius: rounded-2xl rounded-bl-md
  - max-width: 75%
  - padding: 12px 16px
  
Header:
  - Avatar (24px circle, left of name)
  - Name (12px semibold, text-gray-600)

Content:
  - text: 14px, text-gray-900
  - Streaming: trailing "█" cursor (blinking animation)
  
Timestamp:
  - 12px, text-gray-400
  - Format: HH:mm or "刚刚" if <1 min
```

### 3.4 StreamingText

```
Props:
  content: string
  isStreaming: boolean

Behavior:
  - Renders markdown-rendered content (future: Phase 8.1)
  - Appends blinker cursor when streaming
  - Smooth scroll-jump prevention (use overflow-anchor: auto)

Cursor animation:
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  .cursor { animation: blink 1s step-end infinite; }
```

### 3.5 SuggestedReplies

```
Props:
  suggestions: string[]
  onSelect: (text: string) => void

Layout:
  - Horizontal scroll, hidden scrollbar
  - Chips: rounded-full, bg-gray-100, 13px text
  - Padding: 8px 16px per chip
  - Gap: 8px between chips
  - Max 5 chips visible

Behavior:
  - Tap chip → auto-fill input + auto-send (or just fill)
  - Refresh button at end to regenerate suggestions
  - Loading state: skeleton chips

Generation:
  - Call GET /api/chat/[characterId]/suggest
  - Debounce: refresh max 1/10s
```

### 3.6 InputBar

```
Layout:
  ┌────────────────────────────────────┐
  │ ┌──────────────────────────┐ [➤]  │
  │ │ 输入消息...              │       │
  │ └──────────────────────────┘       │
  └────────────────────────────────────┘

Spec:
  - Fixed at bottom, bg-white, border-t
  - Height: min 48px, max 120px (auto-grow)
  - Textarea: flex-1, no border, resize-none
  - Send button: 36px circle, bg-gray-900, white arrow
  - Disabled: bg-gray-200, gray arrow (when input is empty)

Input behavior:
  - Max 2000 characters
  - Enter sends (Shift+Enter for newline)
  - Auto-focus after page load
  - Clear input after send

States:
  - Empty → send disabled, gray
  - Has text → send enabled, black
  - Sending → send shows spinner, input disabled
  - Error → input stays filled, error toast
```

---

## 4. Page States

### 4.1 Loading

```
Full-screen centered spinner
Text: "加载中..."
Background: white
```

### 4.2 Not Logged In

```
Same login gate as other pages:
  - App title + subtitle
  - Email input + login button
  - Uses useAuth() hook
```

### 4.3 Character Not Found

```
Centered:
  - "😢" emoji
  - "角色不存在"
  - "返回角色列表" button → /characters
```

### 4.4 FREE No API Key

```
Full-width warning banner:
  - ⚠️ 黄色背景
  - "请先配置 API 接口"
  - "前往配置" button → /api-connections
  - Input bar hidden
```

### 4.5 Empty Conversation

```
MessageList:
  - If greeting exists: greeting bubble (assistant style)
  - "开始对话吧" sub-text below greeting

InputBar: normal
```

### 4.6 Streaming

```
MessageList:
  - Last bubble: assistant style + blinker
  - Auto-scroll follows new content

InputBar: disabled, send button shows spinner

SuggestedReplies: hidden during streaming
```

### 4.7 Error

```
Toast at top:
  - Red background, white text
  - Message: error content
  - Auto-dismiss after 5s
  - Swipe to dismiss

InputBar: re-enabled after error
```

---

## 5. Menu Actions (⋮ button)

```
Action Sheet (bottom sheet):
  ┌────────────────────┐
  │  重新生成           │  ← Regenerate last reply
  ├────────────────────┤
  │  继续回复           │  ← Continue
  ├────────────────────┤
  │  建议回复           │  ← Generate suggestions
  ├────────────────────┤
  │  清除对话           │  ← Clear all messages (confirm)
  ├────────────────────┤
  │  取消               │
  └────────────────────┘
```

---

## 6. Responsive Design

| Breakpoint | Behavior |
|------------|----------|
| Mobile (<640px) | Full-width, bubbles max 85% width |
| Tablet (640-1024px) | Centered, max-w-2xl container |
| Desktop (>1024px) | Centered, max-w-3xl, side panels? |

---

## 7. Accessibility

- Send button: aria-label="发送消息"
- Input: aria-label="输入消息"
- Messages: role="log", aria-live="polite"
- Streaming: aria-live="assertive" on last bubble
- Keyboard: Enter to send, Tab to navigate