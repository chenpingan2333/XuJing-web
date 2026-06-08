# 叙境（Xujing）项目规则 · Skill 调用总纲

> **用途**：每次新任务启动前，必须先查阅本文件，确定需要调用的 skill 组合。
> **位置**：`D:\modelbridge\叙境app\PROJECT_RULES.md`
> **更新时间**：2026-06-07

---

## 一、Skill 全量清单（22 个）

### A. 系统级（5 个）— 位于 `C:\Users\陈平安\.codex\skills\.system\`

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 1 | imagegen | 生成/编辑位图：照片、插画、纹理、精灵图、mockup | 生成图片、做图、插图 |
| 2 | openai-docs | OpenAI 产品/API 文档查询、模型选择、Codex 自身知识 | OpenAI、Codex 怎么用、模型推荐 |
| 3 | plugin-creator | 创建/搭建 Codex 插件目录和 manifest | 创建插件、plugin |
| 4 | skill-creator | 创建/更新自定义 skill | 创建 skill、写一个 skill |
| 5 | skill-installer | 从 curated list 或 GitHub 安装 skill | 安装 skill |

### B. 实现类（4 个）

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 6 | karpathy-guidelines | **行为基线**：简化代码、手术式修改、目标驱动 | **所有编码任务** |
| 7 | fullstack-guardian | 全栈功能开发：前端+后端+安全三视角并重 | 全栈、前后端、CRUD、API+UI |
| 8 | secure-code-guardian | 认证/授权/输入校验/OWASP 防护/bcrypt/JWT | 认证、授权、加密、XSS、SQL 注入 |
| 9 | javascript-pro | 现代 JS/ES2023+/async/ESM/Node.js/Web API | JavaScript、vanilla JS、Node、async |

### C. 质量类（4 个）

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 10 | code-reviewer | 代码审查：bug、安全漏洞、代码坏味、架构问题 | review、审查、code review |
| 11 | test-master | 测试全领域：单元/集成/E2E/性能/安全测试 | 写测试、单元测试、加测试 |
| 12 | debugging-wizard | 系统化调试：复现→隔离→假设→修复→防回归 | 报错、bug、不工作、调不通 |
| 13 | playwright-expert | Playwright E2E 测试：POM、选择器、API mock | Playwright、E2E、浏览器自动化 |

### D. 分析/设计类（4 个）

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 14 | api-designer | REST/GraphQL API 设计、OpenAPI 3.1 规范 | API 设计、REST、OpenAPI |
| 15 | spec-miner | 逆向工程：从无文档代码库提取规范 | 老代码、没文档、搞清楚怎么用 |
| 16 | database-optimizer | 数据库性能优化：索引/查询计划/配置调优 | 慢查询、数据库慢、索引优化 |
| 17 | legacy-modernizer | 遗留系统渐进式迁移：绞杀者模式/抽象分支 | 重构老系统、技术债、系统迁移 |

### E. 专项类（3 个）

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 18 | seo-technical-expert | 技术 SEO：Core Web Vitals、结构化数据、移动端优化、抓取/索引管理 | SEO、性能优化、结构化数据、robots.txt、sitemap、Core Web Vitals、抓取 |
| 19 | prompt-engineer | LLM prompt 设计与优化：CoT/few-shot/结构化输出 | prompt、提示词、系统提示 |
| 20 | security-reviewer | 安全审计：漏洞扫描/SAST/渗透测试/合规检查 | 安全审查、漏洞扫描、安全审计 |

### F. 文档/数据库类（2 个）

| # | Skill | 用途 | 触发词 |
|---|-------|------|--------|
| 21 | code-documenter | 技术文档：docstring/JSDoc/OpenAPI/教程 | 写文档、docstring、API 文档 |
| 22 | sql-pro | SQL 查询优化与数据库设计 | SQL 优化、复杂查询、CTE、数据库设计 |

---

## 二、叙境（Xujing）MVP 产品定义 V1.0

> **唯一权威来源**。禁止参考历史叙境代码、历史叙境文档、旧架构。禁止恢复旧架构。禁止迁移旧项目。如发现与旧实现冲突，以本文件为准。

### 项目定位

- **产品名称**：叙境（Xujing）
- **定位**：AI 恋爱陪伴平台
- **面向**：18 岁以上成年用户
- **核心卖点**：鲜活角色、长期记忆、自然关系发展、网络文化适配、成年人情感陪伴

### 域名与部署

- **主站**：modelbridge.top
- **叙境为独立分站**，要求：与主站业务隔离、与主站数据库隔离、与主站页面隔离
- **部署环境**：Docker、Cloudflare Tunnel、Linux 服务器

### 登录注册

- **注册方式**：邮箱验证码登录
- **邮件服务**：使用 Resend 官方服务发送验证码
- **登录成功后**：直接进入角色页面，**禁止首页**

### 用户体系

**普通用户**：
- 最多创建 2 个角色
- 聊天必须配置自己的 API（平台不提供模型）
- 记忆容量：每个角色 100 条长期记忆

**VIP 用户**：
- 无限创建角色
- 可使用平台模型或自己的 API
- 后台实际模型：DeepSeek V4 Flash
- 前台统一显示：**VIP 专属模型**（不显示真实模型名称）
- 记忆容量：每个角色 10000 条长期记忆

### 星钻系统

- **统一货币**：星钻
- **汇率**：1 元人民币 = 100 星钻
- **充值档位**：

| 人民币 | 星钻 |
|--------|------|
| 4.9 元 | 490 |
| 9.9 元 | 990 |
| 19.9 元 | 1990 |
| 29.9 元 | 2990 |
| 71.9 元 | 7190 |
| 199.9 元 | 19990 |

- **支付**：支付宝收款码、微信收款码

### VIP 会员

| 类型 | 价格（星钻） | 备注 |
|------|-------------|------|
| 月卡 | 2990 | — |
| 月卡（首次） | 990 | 仅首次购买会员 |
| 季卡 | 7190 | — |
| 年卡 | 19990 | — |

首次判断依据：是否购买过会员。

### 关系系统

- **禁止**：好感度、亲密度、爱情值、关系等级
- **关系成长来源**：长期聊天、长期记忆、共同经历、角色设定
- **不得出现**：+5 好感、+10 亲密、Lv3 关系

### 官方角色

- MVP 阶段仅提供 2 个官方免费角色（后续由项目方提供角色卡文件）
- 注册即拥有、永久免费、不占用户角色名额

### 角色页面

登录后默认进入。包含：
- 新建角色
- 从文件导入角色卡
- API 连接
- 我的角色

**新建角色**：
- 图片（可选）：角色头像、聊天背景
- 名字（必填）：提示"为你的角色命名"
- 角色设定（必填）：角色基本设定，名字，性别，年龄，职业，爱好等
- 开场白（必填）：角色向你发送的第一条消息，使用 `<START>` 分割多条开场白
- 高级定义（可折叠）：性格特点、情景设定、对话示例
- 扩展字段（折叠模块）：昵称、群聊开场白
- 系统指令：Main Prompt、Post-History Instructions，支持 `{{original}}` 引用默认提示词
- 角色公开设置：仅自己可见（默认）/ 发布到角色广场

**角色广场**：MVP 不开发。入口保留，点击显示"请等待官方大大后续更新~"

### 导入角色卡

- 支持 `.json`
- 支持格式：叙境角色卡、Tavern Character Card、SillyTavern 角色卡
- 流程：选择 JSON → 解析 → 预览 → 确认导入 → 生成角色

### 角色管理

角色页面右上角「管理」：编辑角色、导出 JSON、复制角色、删除角色

### API 连接系统

角色页面提供「API 连接」入口。

**API 配置字段**：
- 名称（用户自定义）
- 模型平台选项：GPT（OpenAI）/ Claude（Anthropic）/ Gemini（Google）/ DeepSeek / Grok（xAI）/ 自定义(OpenAI 兼容) / 自定义(Anthropic 兼容) / 自定义(Gemini 兼容)

**默认地址**：
- OpenAI：`https://api.openai.com`
- Anthropic：`https://api.anthropic.com`
- Gemini：`https://generativelanguage.googleapis.com`
- DeepSeek：`https://api.deepseek.com`
- Grok：`https://api.x.ai`

**自定义协议**：用户填写 API 接口地址、API 密钥（密码框）、完整模型 ID（如 `gpt-4.1`、`claude-sonnet`、`deepseek-chat`、`gemini-2.5-pro`、`grok-4`）

**必须支持测试连接**：结果显示"连接成功"或"连接失败"

### 聊天页面

微信风格聊天界面。

- **顶部**：角色头像、角色名称、记忆状态（如"记忆 35/100"、"记忆 812/10000"）
- **中部**：聊天记录
- **每条 AI 消息下方**：重新生成（↻）、再回复一句（⏩）、AI 帮我回复（💬，自动填入输入框）
- **输入框**：Placeholder "随便聊聊……"，发送按钮

### 底部导航栏

固定显示，禁止隐藏。仅保留：**角色、聊天、商店、我的**（删除首页）。

### 我的页面

显示：头像（支持本地上传）、昵称（默认空，用户自行设置，**禁止自动生成"叙境旅人xxxx"**）、邮箱、用户 ID

**会员展示**：
- 普通用户：显示"普通用户"
- VIP：显示"VIP 用户" + 到期时间
- VIP 页面视觉更精致

### 设置页面

- 用户人设：你在角色眼中的身份设定，全角色共享
- 修改昵称
- 修改密码（预留）
- 退出登录
- 管理员后台入口（仅管理员显示）

### 管理员后台

入口：设置 → 管理员后台（仅管理员显示）
- 用户管理：新增用户、封禁用户
- 角色管理：下架角色
- 充值记录：查看订单
- 会员管理：手动发放 VIP、取消 VIP

### MVP 明确不做

禁止开发：好感度系统、关系等级系统、世界系统、剧情系统、任务系统、签到系统、排行榜、邀请码系统、Agent 系统、多角色群聊、创作者分成、角色广场

---

## 三、任务 → Skill 决策矩阵

> **规则**：根据任务类型，在下表中找到对应行，调用全部 "Must" skill。标记为 "Opt" 的按需调用。

### 编码实现类

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| **任何编码任务** | karpathy-guidelines | — | 行为基线，必须最先调用 |
| 全栈功能开发（前后端+API） | fullstack-guardian | secure-code-guardian, javascript-pro | 涉及前端+后端同时开发 |
| 纯前端页面/组件 | javascript-pro | fullstack-guardian | vanilla JS 或框架均可 |
| 纯后端/Node.js | javascript-pro | fullstack-guardian | Node.js 后端服务 |
| 涉及认证/授权/加密 | secure-code-guardian | fullstack-guardian | 密码、JWT、权限、验证码 |

### 质量保障类

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| 代码审查/review | code-reviewer | security-reviewer | PR review 或代码质量审计 |
| 写测试 | test-master | playwright-expert | 单元/集成/E2E 测试 |
| Playwright E2E 测试 | playwright-expert | test-master | 浏览器自动化测试 |
| 调试 bug | debugging-wizard | code-reviewer | 报错排查、根因分析 |

### 分析/设计类

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| API 设计 | api-designer | code-documenter | REST/GraphQL 接口设计 |
| 理解遗留代码 | spec-miner | code-documenter | 无文档代码库分析 |
| 数据库设计/优化 | database-optimizer, sql-pro | — | 表设计、索引、性能 |
| 系统迁移/重构 | legacy-modernizer | spec-miner, test-master | 渐进式迁移 |

### 安全类

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| 实现安全功能 | secure-code-guardian | fullstack-guardian | 认证/加密实现 |
| 安全审计 | security-reviewer | secure-code-guardian | 漏洞扫描/审计报告 |

### SEO / 性能类

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| 网站技术 SEO 优化 | seo-technical-expert | javascript-pro, code-reviewer | Core Web Vitals、结构化数据、抓取优化 |
| 网站性能优化 | seo-technical-expert | javascript-pro | LCP/CLS/INP 调优 |
| 结构化数据实施 | seo-technical-expert | code-documenter | Schema Markup (JSON-LD) |
| SEO 技术审计/诊断 | seo-technical-expert | debugging-wizard | 抓取问题、索引问题排查 |

### 文档/其他

| 任务类型 | Must 调用 | Opt 调用 | 说明 |
|----------|-----------|----------|------|
| 写技术文档 | code-documenter | spec-miner | docstring/API 文档/教程 |
| Prompt 设计 | prompt-engineer | — | LLM prompt 优化 |
| 生成图片 | imagegen | — | 位图生成/编辑 |
| 安装 skill/plugin | skill-installer 或 plugin-creator | — | 技能/插件管理 |

---

## 四、叙境开发阶段与 Skill 绑定

### 开发顺序（严格按此执行）

```
架构 → 数据库 → API → 页面 → 认证
  → 角色系统 → 聊天系统 → 记忆系统
  → 钱包 → 会员 → 后台
```

### 每阶段必须调用以下全部 Skills

| 开发阶段 | 必须调用的 Skills |
|----------|------------------|
| **架构设计** | spec-miner, karpathy-guidelines, database-optimizer, sql-pro, api-designer, code-reviewer |
| **数据库** | database-optimizer, sql-pro, code-reviewer, karpathy-guidelines |
| **API** | api-designer, fullstack-guardian, javascript-pro, secure-code-guardian, code-reviewer, karpathy-guidelines |
| **页面** | fullstack-guardian, javascript-pro, code-reviewer, test-master, playwright-expert, karpathy-guidelines |
| **认证** | secure-code-guardian, fullstack-guardian, api-designer, test-master, code-reviewer, karpathy-guidelines |
| **角色系统** | fullstack-guardian, javascript-pro, secure-code-guardian, database-optimizer, sql-pro, test-master, karpathy-guidelines |
| **聊天系统** | fullstack-guardian, javascript-pro, api-designer, test-master, playwright-expert, karpathy-guidelines |
| **记忆系统** | fullstack-guardian, javascript-pro, database-optimizer, sql-pro, api-designer, test-master, karpathy-guidelines |
| **钱包** | fullstack-guardian, javascript-pro, secure-code-guardian, database-optimizer, sql-pro, code-reviewer, karpathy-guidelines |
| **会员** | fullstack-guardian, javascript-pro, secure-code-guardian, database-optimizer, sql-pro, test-master, karpathy-guidelines |
| **后台** | fullstack-guardian, javascript-pro, secure-code-guardian, test-master, playwright-expert, code-reviewer, karpathy-guidelines |

---

## 五、每次新任务的强制执行流程

**Step 1：读本文件**
打开 `D:\modelbridge\叙境app\PROJECT_RULES.md`，确认当前任务所属开发阶段。

**Step 2：匹配阶段 Skill 清单**
在"四、叙境开发阶段与 Skill 绑定"中找到对应阶段，确定 Must 调用的全部 skill。

**Step 3：调用 Must skill**
按顺序打开并阅读所有 Must skill 的 `SKILL.md`，遵循其核心工作流。

**Step 4：执行任务**
在 skill 指导下完成编码/分析/测试，严格遵守"二、产品定义"。

---

## 六、Skill 协调规则

1. **karpathy-guidelines 永远最先调用** — 它为所有后续 skill 设定行为基线
2. **secure-code-guardian 与 security-reviewer 分工** — 前者用于"实现安全功能"，后者用于"审计现有代码"
3. **code-reviewer 与 security-reviewer 可叠加** — 但 code-reviewer 覆盖面更广（含安全），security-reviewer 安全更深
4. **test-master 与 playwright-expert 可叠加** — test-master 管策略，playwright-expert 管实现
5. **seo-technical-expert 与 javascript-pro 可叠加** — SEO 专家做诊断和策略，JS 专家落地性能优化实现
6. **同阶段 skill 全部调用** — 不设上限，以第四节阶段清单为准

---

## 七、快速参考卡片

```
┌───────────────────────────────────────────────────┐
│  产品：叙境（Xujing）— AI 恋爱陪伴平台               │
│  唯一产品定义：本文档第二节                           │
│  禁止参考历史代码/文档/架构                           │
│                                                    │
│  每次任务必调：karpathy-guidelines                   │
│  开发阶段 Skill：见第四节                             │
│                                                    │
│  写代码：fullstack-guardian + javascript-pro         │
│  涉及安全：secure-code-guardian                      │
│  审查代码：code-reviewer                             │
│  写测试：test-master                                 │
│  调试：debugging-wizard                              │
│  E2E：playwright-expert                              │
│  SEO/性能：seo-technical-expert                      │
│  数据库：database-optimizer + sql-pro                │
│  API 设计：api-designer                              │
└───────────────────────────────────────────────────┘
```
## 八、叙境开发铁律（最高优先级）
Rule 1：缺少配置必须询问

如果任务需要以下信息：

Resend API Key
PostgreSQL 连接信息
Docker 配置
Cloudflare Tunnel 配置
域名配置
支付配置
管理员账号
官方角色文件

禁止：

自动跳过
使用占位符继续开发
编造测试数据代替

必须暂停并询问项目负责人。

Rule 2：禁止超阶段开发

当前阶段之外的内容禁止实现。

例如：

如果当前处于数据库阶段：

禁止：

创建 Next.js 页面
创建 API
创建 React 组件

如果当前处于页面阶段：

禁止：

实现聊天逻辑
实现钱包逻辑
实现会员逻辑

每次任务只允许完成当前阶段目标。

Rule 3：发现需求冲突必须先报告

发现以下情况：

产品定义存在歧义
数据结构存在冲突
页面流程存在冲突
技术方案存在冲突

禁止自行决定。

必须：

列出冲突点
提出方案A
提出方案B
等待项目负责人选择
Rule 4：禁止恢复旧叙境

禁止：

从 Git 历史恢复代码
从历史目录迁移代码
从历史数据库迁移设计
从旧文档复制架构

当前项目视为：

“全新项目”。

Rule 5：网络访问失败处理

如需联网：

优先正常访问。

如果失败：

使用代理：

127.0.0.1:7897

仍失败：

报告问题并停止。

禁止伪造结果。

Rule 6：所有阶段必须有验收结果

阶段结束时必须输出：

已完成内容
未完成内容
风险项
需要项目负责人提供的信息

未经确认不得进入下一阶段。