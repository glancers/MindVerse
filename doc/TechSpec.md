# MindVerse 技术架构文档（TechSpec）

> 版本：v0.2.0-draft | 日期：2026-09-01 | 状态：第一阶段已实现，第二阶段设计中

## 0. 阶段划分

| 阶段 | 形态 | 状态 |
| --- | --- | --- |
| 第一阶段（§1–§11） | 纯前端 SPA：React + Dexie(IndexedDB)，浏览器直连 LLM | 已实现 |
| 第二阶段（§12 起） | Rust 服务端：axum + SQLite + JWT，多用户、多端同步、服务端代理 LLM | 设计中 |

## 1. 技术选型（第一阶段）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | React 18 + TypeScript + Vite | 用户技术栈，纯前端 SPA |
| 样式 | Tailwind CSS | 快速构建微信式布局，与 DesignSystem 约定一致 |
| 状态 | Zustand | 轻量，会话/设置分 store |
| 持久化 | Dexie (IndexedDB) | 结构化存储消息/人格/会话，容量远超 localStorage |
| 图标 | 内联 SVG 组件（lucide-react） | 项目硬约束：UI 全部 SVG，不用 emoji |
| 请求 | 原生 fetch + SSE 手写流式解析 | 统一 5 分钟 AbortController 超时；不引重 SDK |

不引入路由库：单页三栏布局，视图切换用 store 状态完成。

## 2. 总体架构

```
┌─────────────────────────────────────────────┐
│                  React UI                    │
│  会话列表 │ 聊天窗口 │ 人格管理 │ 设置面板     │
├─────────────────────────────────────────────┤
│               Zustand Stores                 │
│  chatStore │ personaStore │ settingsStore    │
├─────────────────────────────────────────────┤
│                 服务层 (src/services)         │
│  ChatScheduler ──► LLMClient ──► ProviderAdapter │
│       │                 │                    │
│       ▼                 ▼                    │
│   PromptBuilder    SSE Parser / Timeout      │
├─────────────────────────────────────────────┤
│              Dexie (IndexedDB)               │
│  personas │ conversations │ messages │ providers │
└─────────────────────────────────────────────┘
```

## 3. 目录结构（规划）

```
MindVerse/
├── doc/                      # 设计文档
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/           # 纯展示组件
│   │   ├── Sidebar/          # 会话列表（微信首栏）
│   │   ├── ChatWindow/       # 消息流 + 输入框
│   │   ├── PersonaManager/   # 人格管理弹层
│   │   ├── GroupSetup/       # 建群/群管理
│   │   └── common/           # ConfirmDialog / Toast / Avatar / Bubble
│   ├── stores/               # zustand stores
│   ├── services/
│   │   ├── llm/              # LLMClient + adapters
│   │   ├── scheduler.ts      # 群聊调度器
│   │   └── prompt.ts         # Prompt 组装
│   ├── db/                   # Dexie schema + 仓库函数
│   ├── types/                # 领域类型
│   └── utils/                # logger / format
└── package.json
```

## 4. 数据模型（IndexedDB / Dexie）

```ts
interface Persona {
  id: string;              // uuid
  name: string;
  avatar?: string;         // 图片 URL 或 dataURL；空则自动生成色块头像
  color: string;           # 头像底色（自动生成或用户选）
  tagline?: string;        // 一句话简介
  group?: string;          // 人格分组名（通讯录按组折叠展示），空 = 不分组
  traits: string[];        // 性格标签 ≤5
  systemPrompt: string;
  modelBinding?: { providerId: string; modelId: string }; // 空=跟随全局
  isPreset: boolean;       // 预设人格不可覆盖删除
  createdAt: number;
  updatedAt: number;
}

interface Provider {
  id: string;
  type: 'ark' | 'openai' | 'anthropic' | 'custom';
  name: string;            // 显示名
  baseURL: string;
  apiKey: string;          // 仅本地
  models: string[];        // 可用模型列表
  defaultModel: string;
}

interface Conversation {
  id: string;
  type: 'private' | 'group' | 'assistant'; // assistant = 无人格、直连全局默认模型（2026-09-05）
  title: string;
  personaIds: string[];    // 私聊=1 个；群聊 ≥2；assistant=空
  hostPersonaId?: string;  // 群聊默认主机智体（无人被@时回答）
  createdAt: number;
  updatedAt: number;       # 用于会话列表排序
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  senderPersonaId?: string;  // assistant 时必填；user 时空
  content: string;
  attachments?: MessageAttachment[];  // 附件：图片(dataURL)/文本(内容)/其他(仅文件名)
  createdAt: number;
  status: 'done' | 'streaming' | 'error' | 'stopped';
}

// 附件：kind 决定模型可见性（image 走多模态、text 拼正文、file 仅文件名）
interface MessageAttachment {
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  dataUrl?: string;  // 图片 dataURL
  text?: string;     // 文本文件内容
}

interface Settings {
  id: 'global';
  activeProviderId: string;
  activeModel: string;
  defaultRounds: number;     // 接龙默认轮数
}
```

索引：`messages.conversationId + createdAt`（拉取会话消息）、`conversations.updatedAt`（列表排序）。

## 5. LLM 接入层

### 5.1 ProviderAdapter 统一接口

```ts
interface LLMRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string; name?: string }[];
  stream: true;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}
interface LLMResult { content: string; }
```

三种 adapter 实现，全部走 fetch：

| Provider type | 协议 | 端点 |
| --- | --- | --- |
| ark / custom / openai | OpenAI Chat Completions | `POST {baseURL}/chat/completions`，`stream: true` |
| anthropic | Anthropic Messages | `POST {baseURL}/messages`，`stream: true`，system 放 header 外的 body 顶层 |

### 5.2 流式与超时（硬约束落地）
- 每次请求创建 `AbortController`，**5 分钟**超时（流式期间每次收到 chunk 重置计时）
- SSE 手写解析：按 `\n\n` 切 event，取 `data:` 行 JSON，容错 `[DONE]` 与注释行
- Anthropic 的 `content_block_delta` 与 OpenAI 的 `choices[0].delta.content` 归一到 `onDelta`
- 思考型模型的 `choices[0].delta.reasoning_content` 归一到 `onReasoning`（2026-09-05）：chatStore 流式期间累积写入 `message.thinking`，气泡渲染为可折叠「思考过程」块；服务器模式下后端同样提取并以 `{"reasoning": "..."}` SSE 事件转发（Anthropic 协议无 reasoning，返回 None）
- 所有 adapter 调用包裹 try/catch，失败向上抛 `LLMError`（含 provider 名与状态码），UI 层 Toast 提示并支持重试
- logger：Key 只记长度不记内容；流式 chunk 用 `debug` 级别

### 5.3 连通性测试
`testProvider(provider, model)`：发送一条 `stream:false` 的极短消息，返回延迟毫秒数或错误。

## 6. Prompt 组装（PromptBuilder）

### 6.1 私聊
```
System: {persona.systemPrompt}
messages: 原样映射 user/assistant
```

### 6.2 群聊
对「即将发言的人格 X」组装：

```
System:
你的人格设定：{X.systemPrompt}
你正在一个群聊「{title}」中，成员有：
- {名字}：{tagline}（{traits}）   ← 其他成员的人设摘要
当前轮到你（{X.name}）发言。请保持你的人设，直接输出内容，不要复述设定。

messages:
历史消息逐条映射，assistant 消息附带 name: 发言者名
用户消息中的 @提及 保留原文
```

### 6.3 接龙模式额外注入
轮到 X 时在 system 末尾追加：
```
这是自动接龙环节，请围绕当前话题继续讨论，可以回应或反驳前面的观点，
发言控制在 3 句以内，自然收敛，不要生硬总结。
```

## 7. 群聊调度器（ChatScheduler）——核心状态机

```
idle ──用户发消息──► 解析@列表 ──► [A,B] 依次生成（串行）
                        │ 无@：host 生成
                        ▼
     生成中：可 stop（AbortController.abort）→ 状态 'stopped'
                        ▼
                    全部完成 → idle

idle ──「让大家聊聊」(rounds=N)──► 接龙队列 = [成员顺序 × N 轮]（去重连续同人）
                        ▼
                 逐个调度生成，每人间隔 300ms
                        ▼
              完成 / 用户停止 / 任一失败(默认暂停并提示) → idle
```

要点：
- 串行调度，绝并发：群消息顺序是产品语义的一部分
- 每次生成前把「已完成消息」写入 DB，崩溃后已生成内容不丢
- 失败策略：某人格生成失败 → Toast 提示 + 该消息标记 error + 接龙暂停（不做自动跳过，让用户决定重试/继续）

### 7.1 AI 助手分支（2026-09-05）

- 生成队列 `GenState.queue` 元素类型为 `string | null`：`null` 表示 assistant 会话（无人格、直连全局默认模型）
- `generateOne(convId, personaId, isRound)`：personaId 为 null 时 system 传空、`senderPersonaId` 留空，其余流程（流式/落库/重试）与私聊一致
- 展示层用 `utils/assistant.ts` 的 `ASSISTANT_PERSONA` 虚拟人格兜底头像/名称（color 用 `var(--mv-accent)`，不硬编码色值）

## 8. 状态管理（Zustand）

| Store | 职责 |
| --- | --- |
| `useChatStore` | 当前会话 id、消息列表（内存镜像）、生成状态机（idle/responding/round-running）、@解析结果 |
| `usePersonaStore` | 人格 CRUD、预设库 |
| `useSettingsStore` | Provider 列表、全局模型、接龙默认轮数 |

消息流：调度器产出 → store 更新（UI 即时渲染）→ 异步写 Dexie。会话切换时按 `conversationId` 批量加载消息。

## 9. 关键交互的工程约束（项目硬约束）

- 上游 API 请求全部 5 分钟 AbortController 超时
- 弹窗遮罩统一 `bg-black/60 backdrop-blur-sm`；ConfirmDialog 经 createPortal 全局渲染
- 通知统一 ToastProvider；删除操作一律自定义 ConfirmDialog
- 所有文本输入（含 textarea）onKeyDown 拦截 `metaKey/ctrlKey + a` 调 `select()`
- 输入为空时发送按钮 `opacity-30` 禁用
- 复制成功 Toast「已经复制到粘贴板」
- 头像图片 `object-fit: contain` 不裁切
- 图标全 SVG，关闭按钮用「×」字符
- 日志统一走 `utils/logger.ts`，`ENABLED` 总开关

## 10. 备份导入导出（已实现，2026-09-01）
- 背景：IndexedDB 受同源策略约束绑定「协议+域名+端口」，端口漂移 / 换浏览器数据不可见
- 导出（`db.ts exportAllData`）：`{app:'MindVerse', version:1, exportedAt, data:{personas, conversations, messages, providers, settings}}` 全量含 API Key（定位是本机私密迁移文件），文件名 `mindverse-backup-YYYYMMDD-HHmm.json`
- 导入（`db.ts importAllData`）：校验 `app === 'MindVerse'` 后，单事务内清空 5 表再 bulkPut（覆盖式，非合并）；UI 侧先弹 ConfirmDialog 覆盖确认，成功后刷新页面重载各 store
- 端口防漂移：`vite.config.ts` 固定 `port: 5175, strictPort: true`，被占用直接报错，不换端口

## 11. 构建与质量
- `pnpm dev` / `pnpm build`（tsc -b + vite build）；开发端口固定 5175
- Vitest 单测覆盖：SSE 解析、@提及解析、调度器状态机、PromptBuilder
- 无 E2E（本期纯前端手测为主，用例见 TestCase.md）

## 11.5 皮肤主题系统（2026-09-01 已实现）

- **原理**：配色本体是 `src/index.css` 里每个 `[data-theme='x']` 块下的一组 `--mv-*` CSS 变量；Tailwind v4 `@theme inline` 把 `--color-mv-*: var(--mv-*)` 映射成 `bg-mv-* / text-mv-* / border-mv-*` 等工具类，组件层零硬编码色值
- **元数据**：`src/themes/themes.ts`（ThemeId / 名称 / 描述 / 深浅标记 / 选择面板迷你色板 swatch），与 CSS 内配色一一对应
- **状态**：`src/stores/themeStore.ts`（zustand）——`setTheme` 写 localStorage `mv-theme` + 挂 `data-theme` + 临时挂 `theme-anim` 类做 300ms 全局色彩过渡；`initTheme()` 在 `main.tsx` 首帧渲染前调用防闪烁
- **入口**：设置弹窗「主题皮肤」面板（ThemeSection），点击即切换即时生效
- **背景壁纸**：皮肤可带壁纸（`--mv-bg-image` + `--mv-bg-mask` 两变量，body 铺图 cover/fixed、`body::before` 蒙层）；带壁纸皮肤的面板色为半透明 rgba；壁纸资产放 `public/backgrounds/`（如 gothic-void-crusade.jpg，来自 Codex-Dream-Skin 预设）；ThemeMeta.`background` 字段供面板显示缩略图与标识
- **约束**：新增皮肤 = index.css 加一个 `[data-theme]` 块 + themes.ts 加一条元数据，组件不用动；危险色 `#E5484D` 不设变量全主题统一；透明度类需求（`bg-mv-accent/10`）走 color-mix，需现代浏览器

---

# 第二阶段：Rust 服务端架构（v0.2 规划）

> 目标：多用户、多端同步、服务端统一持有数据与 LLM 出口。
> 原则：**前端 UI 组件零改动**，只替换数据层；第一阶段本地模式保留为离线兜底。

## 12. 目标架构

```
多端客户端（同一套 React 前端）
  Web 浏览器 │ 桌面 Tauri 壳（可选） │ 移动浏览器
        │  HTTPS  JSON API + SSE（JWT Bearer 认证）
        ▼
┌─────────────── Rust 服务端（axum，单二进制） ───────────────┐
│  auth        注册 / 登录 / token 刷新（argon2 密码哈希 + JWT）│
│  api         personas / conversations / messages /           │
│              providers / settings 的 CRUD（全部按 user_id 隔离）│
│  chat 代理    POST /api/chat：组包 → 调上游 LLM → SSE 透传    │
│  静态托管     生产模式直接 serve 前端 dist（单端口单进程部署） │
├──────────────────────────────────────────────────────────────┤
│  SQLite（sqlx，WAL 模式）—— 表全部带 user_id，可平滑迁 Postgres │
└──────────────────────────────────────────────────────────────┘
        │（仅服务端持有 API Key，前端不再接触明文 Key）
        ▼
  上游 LLM：火山方舟 / OpenAI / Anthropic / 自定义兼容服务
```

### 12.1 关键架构决策

| 决策 | 说明 |
| --- | --- |
| 调度器先留前端 | P1 后端只做存储 + LLM 代理；@点名/接龙的调度逻辑仍在浏览器（与现状一致，页面开着才跑）。P2 再评估后移服务端（接龙不因关页面中断、SSE 广播到所有端） |
| LLM 调用全部走后端 | 根治 CORS（现有 vite /ark 代理退役）；API Key 只存服务端，前端请求只带 providerId，不接触明文 Key |
| 双数据模式 | 前端数据层抽象 `Repository` 接口：`LocalRepository`（Dexie，现状）/ `ServerRepository`（fetch API）。设置里切换，未登录 = 本地模式，行为与第一阶段完全一致 |
| 前端生成 id | id 仍由客户端生成（uuid），后端不做 id 改写，简化多端写冲突处理（同 id upsert） |

## 13. 后端技术选型

| 组件 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | axum | tokio 生态主流，tower 中间件体系，AI 训练语料充足 |
| 数据库 | SQLite + sqlx | 单文件零运维，编译期 SQL 校验；多用户量级内够用，schema 兼容 Postgres |
| 认证 | jsonwebtoken + argon2 | JWT 无状态（多端天然适配）；argon2 密码哈希 |
| SSE | axum `Sse` + reqwest 流式转发 | 上游 chunk 逐段透传给客户端 |
| 序列化 | serde / serde_json | 标准 |
| 配置 | 环境变量 + .env | 部署友好（DATABASE_PATH / JWT_SECRET / LISTEN_ADDR） |
| 日志 | tracing + tracing-subscriber | 结构化日志，Key 只记长度不记内容（延续现有约定） |

## 14. 目录结构（server/）

```
MindVerse/
├── doc/
├── src/                    # 现有 React 前端（不动）
├── server/                 # Rust 服务端（cargo workspace 独立目录）
│   ├── Cargo.toml
│   ├── migrations/         # sqlx 迁移脚本
│   └── src/
│       ├── main.rs         # 启动、路由装配、静态托管
│       ├── config.rs       # 环境变量
│       ├── error.rs        # 统一错误 → HTTP 响应映射
│       ├── auth/           # 注册登录、JWT 签发校验、中间件
│       ├── routes/         # personas / conversations / messages / providers / settings / chat
│       ├── llm/            # 上游适配（OpenAI 兼容 / Anthropic）+ SSE 解析 + 5 分钟超时
│       └── db/             # sqlx 查询封装（全部强制 user_id 过滤）
└── vite.config.ts          # dev 时 /api 代理到 127.0.0.1:8787
```

## 15. 数据库 Schema（SQLite，全部表带 user_id）

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- argon2
  created_at INTEGER NOT NULL
);

-- personas / conversations / messages / providers / settings
-- 字段与第一阶段 TS 类型一一对应（messages 存 JSON 附加字段），
-- 差异点：
--   所有表增加 user_id TEXT NOT NULL REFERENCES users(id)
--   providers.api_key 只存服务端；API 返回给前端时永远掩码/省略
--   settings 以 (user_id) 为主键，替代第一阶段的 id='global'
--   messages 加 thinking TEXT NOT NULL DEFAULT ''（思考型模型推理过程，2026-09-05；存量库启动自动补列）
-- 索引：
--   messages(user_id, conversation_id, created_at)
--   conversations(user_id, updated_at)
--   personas(user_id, updated_at)

-- favorites（2026-09-01 新增）：消息收藏，快照式
CREATE TABLE favorites (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  conversation_id    TEXT NOT NULL,    -- 来源会话（快照关联，无外键）
  conversation_title TEXT NOT NULL,    -- 来源标题快照
  items              TEXT NOT NULL,    -- JSON：[{messageId, role, senderPersonaId, senderName, content, createdAt}]
  created_at         INTEGER NOT NULL
);
-- 索引：favorites(user_id, created_at)
```

> 首个迁移同时内置 8 个预设人格为「全局公共数据」（user_id 为空表示共享），注册时不动、复制照旧。

## 16. API 设计

约定：除 `/api/auth/*` 外全部要求 `Authorization: Bearer <JWT>`；错误统一 `{ "error": { "code": "...", "message": "..." } }`。

### 16.1 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{username, password}` → 创建用户 + 返回 token |
| POST | `/api/auth/login` | `{username, password}` → 返回 `{token, expiresIn}` |
| GET | `/api/auth/me` | 校验 token，返回用户信息 |

JWT 有效期 30 天（个人工具场景，避免频繁重登）；payload 仅含 `sub: user_id`。

### 16.2 业务资源（模式统一）

| 资源 | 端点 |
| --- | --- |
| 人格 | `GET/POST /api/personas`，`PUT/DELETE /api/personas/:id` |
| 会话 | `GET/POST /api/conversations`，`PUT/DELETE /api/conversations/:id` |
| 消息 | `GET /api/conversations/:id/messages?after=&limit=`（增量拉取）、`POST /api/messages`、`DELETE /api/messages/:id` |
| 服务商 | `GET/POST /api/providers`，`PUT/DELETE /api/providers/:id`（**响应中 apiKey 永不回传**） |
| 设置 | `GET/PUT /api/settings` |
| 收藏 | `GET/POST /api/favorites`，`DELETE /api/favorites/:id`（快照式整条替换，无 updatedAt 合并） |

### 16.3 LLM 代理（核心）

```
POST /api/chat          （SSE 响应）
{
  providerId, model,
  system, messages: [{role, content, name?}]
}
→ 逐 delta 事件：data: {"delta": "..."}
→ 结束：data: {"done": true, "usage": {...}}
→ 失败：data: {"error": "..."} 后关流
```

- 服务端按 user_id 取该 provider 的真实 Key，组包调上游；上游协议适配逻辑与第一阶段 TS 实现对齐（OpenAI / Anthropic 双协议）
- **5 分钟超时**：reqwest + tokio::time，每次收到上游 chunk 重置计时（延续硬约束）
- 连通性测试 `POST /api/chat/test`：非流式极短消息，返回延迟 ms

### 16.4 多端同步策略（P1 简化版）

- 写路径：客户端写操作 → 先落服务端（source of truth）→ 更新本地 store
- 读路径：打开会话时 `GET messages?after=lastTs` 增量拉取
- 冲突：不做实时推送与操作变换（OT/CRDT 过重）；同 id upsert、updatedAt 新者胜
- P2 再引入 SSE 广播（`/api/events`），实现多端实时收消息

## 17. 前端改造清单（第二阶段）

| 模块 | 改动 |
| --- | --- |
| 新增 `services/api.ts` | 统一 fetch 封装：JWT 注入、错误归一（映射现有 LLMError 语义）、5 分钟超时 |
| 新增 `services/repo.ts` | `Repository` 接口 + Local（Dexie）/ Server 两实现；chatStore / personaStore / settingsStore 的持久化调用全部走该接口 |
| 新增登录页 | 未登录可「游客模式（本地）」或「登录/注册」；JWT 存 localStorage |
| `llm/client.ts` | 增加后端模式分支：不直连上游，改调 `/api/chat`（SSE 解析逻辑复用） |
| `SettingsDialog` | 增加「服务器」区块：服务器地址、登录态、模式切换（本地/服务器） |
| vite 代理 | `/api` → `127.0.0.1:8787`（dev）；生产由 axum 托管 dist，同源无 CORS |
| 其余 UI 组件 | **零改动** |

## 18. 部署

- **单二进制**：`cargo build --release` 产物内嵌前端 dist（include_dir / RustEmbed），服务器上单文件 + SQLite 文件即全部
- **Docker**：多阶段构建（node 构建前端 → cargo 构建后端）→ scratch/distroless 镜像，预计 < 30MB
- 环境变量：`LISTEN_ADDR`（默认 127.0.0.1:8787）、`DATABASE_PATH`（默认 data/mindverse.db，相对 server/ 运行目录）、`JWT_SECRET`
- HTTPS 由反向代理（Caddy/Nginx）终结

## 19. 演进路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P1-a | server 骨架：auth + 全资源 CRUD + SQLite 迁移 | **已实现（2026-09-01）**，curl 全链路通过 |
| P1-b | `/api/chat` SSE 代理 + 前端双模式切换 | **已实现（2026-09-01）**，curl 全链路通过 |
| P1-c | Docker + 单二进制部署 | 待开发 |
| P2 | 调度器后移 + `/api/events` SSE 广播 | 规划中 |
| P3 | 桌面 Tauri 壳 | **已实现（2026-09-05）**，见 §19.3 |

### 19.1 P1-a 实现说明（与规划的差异）

- 迁移不依赖 sqlx-cli：`migrations/0001_init.sql` 经 `include_str!` 内嵌，启动时执行幂等 SQL（全 IF NOT EXISTS）
- 代码结构比 §14 规划更扁平：`main.rs`（装配）+ `auth.rs`（认证+提取器）+ `routes.rs`（全部 CRUD）+ `llm.rs`（P1-b 引入的 LLM 代理）+ `models.rs`（DTO）+ `error.rs`
- 鉴权用 axum 提取器（`AuthUser: FromRequestParts`）而非中间件，handler 签名更显式
- 预设人格暂不做全局共享（原 §15 的 user_id 为空方案与 NOT NULL 外键冲突）：前端本地已有预设库，二期前端接入时以用户维度同步
- dev 运行：`cd server && JWT_SECRET=dev-secret cargo run`（数据库默认落在 server/data/mindverse.db；端口默认 8787 与 vite 代理一致）；JWT_SECRET 未设置时用随机值（重启即全部登录态失效，生产必须显式设置）

### 19.2 P1-b 实现说明（2026-09-01）

**后端（server/src/llm.rs）**
- `POST /api/chat`：按 user_id 取 provider 真实 Key → 组包（OpenAI / Anthropic 双协议）→ reqwest 流式读上游 → mpsc 通道逐 delta 转发 SSE 事件（`{"delta"}` / `{"done",length}` / `{"error"}`）；上游连接前错误直接返回 HTTP 错误 JSON，连接后错误走 SSE error 事件
- 超时：单次 chunk 读取 `tokio::time::timeout(5min)`（chunk 重置语义）
- `POST /api/chat/test`：非流式 ping，返回 `{latencyMs}`；`GET /api/providers/{id}/models`：模型列表代理
- Provider 更新语义：`apiKey` 留空/缺失 = 保持原 Key（新建仍必填）——配合前端「服务器模式不回显 Key」

**前端（双模式）**
- `services/repo.ts`：所有持久化入口（listPersonas / putMessage / putSettings…），内部按 `authStore.loggedIn` 分派 Dexie 或 API；三个 store 全部改走 repo，**UI 组件零改动**
- `stores/authStore.ts`：token / serverBase 存 localStorage；登录/注册/退出（退出后 reload 回本地模式）
- `services/api.ts`：JWT 注入 + 错误归一 `{error:{code,message}}` → ApiError + 5 分钟超时
- `llm/client.ts`：登录后 streamChat / testProvider / fetchModels 全部走后端代理（浏览器不再接触 Key，无 CORS 问题）；`fetchModels` 服务器模式要求 provider 已保存
- 设置弹窗新增「服务器（多端同步）」区块；vite dev 代理 `/api` → 127.0.0.1:8787

### 19.3 P3 桌面端实现说明（Tauri 2，2026-09-05）

**架构：Tauri 壳 + 内嵌 server（单进程）**

- server crate 改造为 lib + bin 双 target：`server/src/lib.rs` 暴露 `start_server(ServerConfig) -> u16`（绑定后立即返回实际端口，serve 在后台 tokio 任务里跑）；`main.rs` 退化为独立运行薄壳（环境变量行为不变，开发用）
- `src-tauri/src/main.rs`：Tauri setup 里 `tauri::async_runtime::spawn` 拉起内嵌 server；数据目录 `~/Library/Application Support/com.mindverse.desktop`（Windows/Linux 对应路径）；JWT 密钥落盘复用（重启登录态不失效）；首次启动自动从 `server/data/mindverse.db` 迁移开发数据
- **随机端口**：内嵌 server 监听 `127.0.0.1:0`（免配置、不与残留进程冲突），端口经 `handle.manage(port)` 存入 Tauri 状态，前端通过 `invoke('get_server_port')` 轮询获取（上限 10s，超时降级纯本地模式）
- **/ark 透传代理**（`server/src/ark.rs`）：桌面端无 vite 代理，浏览器直连方舟受 CORS 限制，新增 Rust 侧 `/ark/{*path}` 路由原样转发（支持 SSE 流式回传，请求体上限 50MB）；`llm.rs upstream_url` 对相对路径 baseURL 补全方舟域名
- **前端改动**：`utils/desktop.ts` 探测 `__TAURI_INTERNALS__`；`main.tsx` 桌面端启动时注入 serverBase（仅内存，不写 localStorage）；`llm/client.ts resolveBase` 对相对 baseURL（方舟 `/ark/...`）补全为内嵌服务地址（guest 直连模式的 streamChat/testProvider/fetchModels 三处）；设置面板桌面端隐藏「服务器地址」输入框
- **命令**：`pnpm tauri dev`（开发，自动起 vite 5175 + cargo run）；`pnpm tauri build`（打包 .app/.dmg）；`tauri.conf.json` devUrl 指向 localhost:5175，frontendDist 指向 ../dist
- 图标由水墨山水背景生成（`pnpm tauri icon`）
- 验证：server crate `cargo check` 通过；tauri dev 窗口正常拉起；lib 重构后独立运行 `/api/providers` 401（鉴权生效）、`/ark/...` 透传返回上游真实 401（链路通）
