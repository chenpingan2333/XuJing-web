# 叙境-web 图片优化 Phase1 报告

> 执行时间：2026/6/25
> Next.js 版本：15.5.19
> 目标：将关键页面原生 `<img>` 迁移为 `next/image`，补充配置，验证构建

---

## ✅ 构建结果

```
✓ Compiled successfully in 13.0s
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages (18/18)
✓ Collecting build traces
✓ Finalizing page optimization
```

- **TypeScript Error**: 0
- **ESLint Error**: 0
- **Next Build**: 成功

---

## 📊 全站审计摘要

| 指标 | 数值 |
|------|------|
| 审计文件总数 | 10 |
| `<img>` 标签总数 | 17 处 |
| Phase1 改造数 | 6 处 |
| 剩余未改造 | 11 处（含暂缓） |

---

## 🔧 关键变更详情

### 1. 新建公共工具 `src/lib/image-utils.ts`

```typescript
export function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace(/http:\/\/\d+\.\d+\.\d+\.\d+:\d+/, "https://xujing.modelbridge.top");
  }
  if (url.startsWith("/")) {
    return `https://xujing.modelbridge.top${url}`;
  }
  return url;
}
```

**作用**：
- 相对路径 → 绝对路径（域名拼接）
- IP 地址 → 域名替换（解决 standalone 模式 SSL 证书不匹配导致的 500 错误）

### 2. 更新 `next.config.ts`

新增配置项：

```typescript
images: {
  formats: ["image/avif", "image/webp"],
  minimumCacheTTL: 86400,
  // ... 原有 remotePatterns 配置
}
```

**作用**：
- `formats`: 启用 AVIF/WebP 现代格式自动转换
- `minimumCacheTTL`: 图片缓存 24 小时，减少重复优化开销

### 3. P0 改造：`src/app/page.tsx` — Logo

```tsx
// Before
<img src="/logo.png" alt="叙境" className="w-28 h-28" />

// After
<Image
  src="/logo.png"
  alt="叙境"
  width={112}
  height={112}
  priority
  className="object-contain"
/>
```

**优化点**：
- `priority`: 首屏关键资源，启用预加载
- 固定尺寸避免布局偏移（CLS）

### 4. P1 改造：`src/app/chat/page.tsx` — 聊天列表头像

```tsx
// Before
<img src={chat.avatarUrl} alt="" className="w-full h-full object-cover" />

// After
<Image
  src={toAbsoluteUrl(chat.avatarUrl!)}
  alt=""
  width={48}
  height={48}
  className="object-cover"
/>
```

**优化点**：
- 使用 `next/image` 自动格式转换和压缩
- `toAbsoluteUrl` 确保 standalone 模式下回源正常

### 5. P1 改造：`src/app/plaza/page.tsx` — 3 处 `<img>`

#### 5.1 角色大图（卡片）

```tsx
// Before
<img
  src={char.avatarUrl ? `/api/upload?url=${encodeURIComponent(char.avatarUrl)}&w=400&q=80` : "/favicon.svg"}
  className="w-full h-full object-cover"
  alt=""
/>

// After
<Image
  src={char.avatarUrl ? `/api/upload?url=${encodeURIComponent(char.avatarUrl)}&w=400&q=80` : "/favicon.svg"}
  alt={char.name}
  fill
  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
  className="object-cover transition-transform duration-300 group-hover:scale-105"
/>
```

**优化点**：
- `fill` + `sizes`: 响应式图片，根据视口自动选择合适尺寸
- 保留现有 `/api/upload` 自定义压缩接口，叠加 `next/image` 格式转换和缓存

#### 5.2 创作者头像（底部栏）

```tsx
// Before
<img src={c.avatarUrl || "/favicon.svg"} className="w-full h-24 object-cover" alt="" />

// After
<Image
  src={toAbsoluteUrl(c.avatarUrl || "/favicon.svg")}
  alt={c.name}
  width={96}
  height={96}
  className="object-cover"
/>
```

#### 5.3 弹窗头像

```tsx
// Before
<img src={selectedChar.avatarUrl || "/favicon.svg"} className="w-12 h-12 rounded-xl object-cover shadow-md" />

// After
<Image
  src={toAbsoluteUrl(selectedChar.avatarUrl || "/favicon.svg")}
  alt={selectedChar.name}
  width={48}
  height={48}
  className="rounded-xl object-cover shadow-md"
/>
```

### 6. P1 改造：`src/app/characters/page.tsx` — 统一导入

```tsx
// Before
import { toAbsoluteUrl } from "../lib/image-utils"; // 本地定义

// After
import { toAbsoluteUrl } from "@/lib/image-utils"; // 公共导入
```

**优化点**：
- 消除重复代码，统一维护

---

## 📁 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/lib/image-utils.ts` | 新建 | 公共 `toAbsoluteUrl()` 工具 |
| `next.config.ts` | 修改 | 补充 `formats`、`minimumCacheTTL` |
| `src/app/page.tsx` | 修改 | Logo: `<img>` → `<Image priority>` |
| `src/app/chat/page.tsx` | 修改 | 头像: `<img>` → `<Image>` + `toAbsoluteUrl` |
| `src/app/plaza/page.tsx` | 修改 | 3 处 `<img>` → `<Image>` + `toAbsoluteUrl` |
| `src/app/characters/page.tsx` | 修改 | 本地 `toAbsoluteUrl` → 公共导入 |

---

## ⚠️ 约束与限制

1. **standalone 模式限制**：`_next/image` 回源需完整 URL，IP 回源因 SSL 证书不匹配导致 500，必须使用域名 `xujing.modelbridge.top`
2. **plaza 角色大图**：保留现有 `/api/upload?url=...&w=400&q=80` 自定义压缩接口，仅替换为 `<Image fill>` 利用格式转换和缓存
3. **禁止新增图片压缩库**、禁止新 CDN、禁止修改业务逻辑
4. **ChatClient.tsx 暂缓**：用户明确要求先不动，涉及背景图、开场图、弹窗图、fallback 逻辑
5. **本地预览保持原样**：`characters/new/page.tsx`、`characters/[id]/page.tsx`、`ImportCharacterModal.tsx`、`me/page.tsx` 的 data URL 预览部分保持 `<img>`

---

## 📋 Phase2 待办（未执行）

| 文件 | 数量 | 状态 | 备注 |
|------|------|------|------|
| `src/app/chat/[characterId]/CharacterHeader.tsx` | 1 处 | 待改造 | 用户要求保持现有 onError 逻辑，改造后单独验证 |
| `src/app/chat/[characterId]/ChatClient.tsx` | 5 处 | 暂缓 | 背景图/开场图/弹窗图/fallback，用户明确要求先不动 |
| `src/app/me/page.tsx` | 1 处 | 保持原样 | 本地预览 data URL |
| `src/components/ImportCharacterModal.tsx` | 2 处 | 保持原样 | 本地预览 data URL |

---

## 🎯 优化收益

| 优化项 | 收益 |
|--------|------|
| `next/image` 自动格式转换 | AVIF/WebP 现代格式，体积减少 20-50% |
| `priority` 预加载 | 首屏 Logo 加载速度提升 |
| `fill` + `sizes` 响应式 | 根据设备视口加载合适尺寸图片，减少带宽 |
| `minimumCacheTTL: 86400` | 图片缓存 24 小时，降低重复优化 CPU 开销 |
| `toAbsoluteUrl` 统一处理 | 解决 standalone 模式 IP 回源 500 问题，确保图片稳定加载 |

---

## 🔮 后续建议

1. **Phase2 改造**：待用户确认后执行剩余 6 处 `<img>` 迁移（排除本地预览和暂缓文件）
2. **监控验证**：上线后通过 Lighthouse 验证图片优化分数（Performance > 90）
3. **CDN 配置**：如后续使用腾讯云 CDN，可配合 `next/image` 实现边缘缓存

---

*报告生成完成，构建验证通过。*
