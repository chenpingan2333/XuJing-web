# 叙境 (Xujing) — Skill Governance V1

> **版本**: V1.0 | **日期**: 2026-06-08
> **适用范围**: Phase 0–9.6 全部开发任务
> **优先级**: 最高 — 违反本规则视为开发违规

---

## 核心原则

任何开发任务禁止直接编码。

必须遵循：

```
Architecture → Design → Review → Implementation → Audit → Test → Documentation
```

**任何阶段跳过均视为违规。**

---

## 第一部分：架构与代码开发规则

### 新功能开发

调用顺序：

```
fullstack-architecture → api-designer(涉及接口) → postgres-drizzle / sql-pro(涉及数据库) → fullstack-guardian → javascript-pro
```

| Skill | 职责 | 输出 |
|-------|------|------|
| `fullstack-architecture` | 架构一致性检查：是否符合 Architecture Lock V1、Database Freeze、模块边界 | 架构合规确认 |
| `api-designer` | REST API 设计、OpenAPI 规范、请求响应结构 | `API_SPEC.md` |
| `postgres-drizzle` | Schema 设计、Migration 设计、Repository 实现 | Migration SQL + Schema 变更 |
| `sql-pro` | SQL 质量审查、索引设计、查询优化 | 查询审查报告 |
| `fullstack-guardian` | 业务实现、API 实现、页面实现、服务实现 | 实现代码 |
| `javascript-pro` | TypeScript、React、Next.js 15、类型安全 | 前端代码 |

**禁止**：
- 绕过 Architecture Lock V1 私自新增系统
- 修改已冻结的 Schema 字段类型
- 修改已冻结的枚举值

---

## 第二部分：UI / UX 设计规则

**禁止直接让 AI 写页面。必须先设计。**

### UI 设计阶段

调用顺序：

```
frontend-design → designlint(CREATE模式) → frontend-design
```

#### frontend-design

生成 `DESIGN_SYSTEM.md`，内容：

- Palette（主色、辅色、中性色、语义色）
- Typography（字体族、字号阶梯、行高、字重）
- Radius（组件圆角规范）
- Elevation（阴影层级）
- Motion（动效时长、缓动曲线）
- Component Rules（Button、Input、Card、Dialog、Bubble 等组件规范）

必须明确以下页面的视觉语言：
- Chat 页面（`/chat/[characterId]`）
- Character 页面（`/characters`、`/characters/new`、`/characters/[id]`）
- API 配置页面（`/api-connections`）
- Profile 页面（`/me`、`/me/settings`）

#### designlint (CREATE 模式)

强制完成 9 项设计决策审查：

1. 用户是谁
2. 使用场景
3. 页面目标
4. 信息层级
5. 视觉层级
6. 交互逻辑
7. 移动端适配
8. 无障碍
9. 品牌一致性

输出 `DESIGN_REVIEW.md`。未通过禁止进入开发阶段。

---

## 第三部分：UI 实现规则

调用顺序：

```
frontend-design → fullstack-guardian → javascript-pro
```

**要求**：严格遵循 `DESIGN_SYSTEM.md` 实现。

**禁止**：
- 自行修改设计语言
- 临时增加视觉风格
- 使用默认 shadcn 风格
- 使用默认 Tailwind 配色

---

## 第四部分：去 AI 味审查

页面开发完成后，强制调用：

```
avoid-ai-design
```

### 审查目标

**AI Slop 检测**，禁止以下模式：

| 禁止模式 | 说明 |
|---------|------|
| 紫色渐变背景泛滥 | AI 生成页面的标志性特征 |
| 默认 Inter 字体 | 需替换为品牌字体 |
| 默认 shadcn Button | 必须自定义样式 |
| 默认 shadcn Card | 必须自定义样式 |
| 默认 Hero Layout | 非营销页面禁止 Hero Section |

**禁止直接复制** ChatGPT / Claude / Character AI 界面。必须保留叙境品牌识别。

**模板化问题检测**：
- 组件重复
- 间距重复
- 视觉单调
- 动效缺失

输出 `UI_AUDIT_REPORT.md`。不通过必须重构。

---

## 第五部分：设计规范审查

调用：

```
designlint (AUDIT模式)
```

检查：
- 是否符合 `DESIGN_SYSTEM.md`
- 是否符合 `14-chat-ui-spec.md`（Chat UI Spec）
- 是否符合 Mobile First 原则

输出 `DESIGN_LINT_REPORT.md`。

---

## 第六部分：安全开发规则

涉及登录、JWT、API Key、权限时，必须调用：

```
secure-code-guardian → security-reviewer
```

| Skill | 职责 | 输出 |
|-------|------|------|
| `secure-code-guardian` | Auth 实现、JWT、Session、Refresh Token、API Key 加密 | 安全实现代码 |
| `security-reviewer` | 安全审计、OWASP 检查、SSRF 检查、API Key 泄露检查 | `SECURITY_REPORT.md` |

---

## 第七部分：代码审查规则

每个 Wave 结束，强制调用：

```
code-reviewer
```

输出 `CODE_REVIEW_REPORT.md`。

检查项：
- Bug
- Code Smell
- 架构问题
- 性能问题
- 类型安全（`as any` 残留）

---

## 第八部分：Bug 修复规则

发现 Bug 后，调用顺序：

```
bug-localization → debugging-wizard → bug-localization
```

| Skill | 职责 | 输出 |
|-------|------|------|
| `bug-localization` | 定位问题文件、函数、行号 | Bug 定位报告 |
| `debugging-wizard` | 复现问题、假设验证、根因分析 | `ROOT_CAUSE.md` |

**禁止直接猜测修改。**

---

## 第九部分：测试规则

每个 Wave 结束，调用：

```
test-master
```

生成 `TEST_REPORT.md`，内容：

- 单元测试
- 集成测试
- API 测试

Chat 系统完成后，调用：

```
playwright-expert
```

生成 `E2E_REPORT.md`，验证：

- 注册 → 登录
- 创建角色
- 编辑角色
- 聊天（发送 / 流式接收 / 重新生成 / 建议回复）
- 会话切换
- 消息历史持久化
- 长期记忆（提取 → 检索 → 注入）

**全部通过方可上线。**

---

## 第十部分：文档规则

每个 Wave 结束，调用：

```
code-documenter
```

生成 `WAVE_COMPLETION_REPORT.md`，内容：

- 修改文件清单
- 新增模块说明
- API 变更
- 数据库变更（Migration 编号 + 影响范围）
- 测试结果摘要
- 回滚方案

---

## Phase 8–9 特殊规则

### Chat UI 开发（Phase 8）

完整链路（9 个 Skill，按顺序）：

```
1. frontend-design      → DESIGN_SYSTEM.md
2. designlint (CREATE)  → DESIGN_REVIEW.md
3. fullstack-guardian   → 页面实现
4. javascript-pro       → 前端代码
5. avoid-ai-design      → UI_AUDIT_REPORT.md
6. designlint (AUDIT)   → DESIGN_LINT_REPORT.md
7. code-reviewer        → CODE_REVIEW_REPORT.md
8. test-master          → TEST_REPORT.md
9. playwright-expert    → E2E_REPORT.md
```

**未完成全部链路，禁止提交。**

### Memory Engine 开发（Phase 9 Wave 3）

```
1. fullstack-architecture  → 架构合规确认
2. postgres-drizzle        → Schema + Migration
3. sql-pro                 → 索引验证
4. fullstack-guardian      → MemoryExtractor/Retriever/Consolidator 实现
5. javascript-pro          → TypeScript 类型安全
6. code-reviewer           → 代码审查
7. test-master             → 单元+集成测试
```

---

## 违规处理

| 违规 | 处理 |
|------|------|
| 跳过架构审查直接编码 | 代码废弃，重新走全流程 |
| 跳过设计阶段直接写 UI | 页面废弃，从 DESIGN_SYSTEM.md 开始 |
| 跳过 avoid-ai-design | 禁止合并；立即执行审查 |
| 跳过测试直接提交 | 禁止合并；补齐测试 |
| 绕过 Architecture Lock | 代码废弃 + 架构回滚 |
| 修改冻结 Schema/Enum | 代码废弃 + 重新冻结裁决 |

---

## 附录：Skill 调用速查卡

```
新功能开发：
  fullstack-architecture → api-designer? → postgres-drizzle/sql-pro? → fullstack-guardian → javascript-pro

UI 设计：
  frontend-design → designlint(CREATE) → frontend-design

UI 实现：
  frontend-design → fullstack-guardian → javascript-pro

UI 审查：
  avoid-ai-design → designlint(AUDIT)

安全：
  secure-code-guardian → security-reviewer

代码审查：
  code-reviewer

Bug 修复：
  bug-localization → debugging-wizard

测试：
  test-master → playwright-expert?

文档：
  code-documenter
```
