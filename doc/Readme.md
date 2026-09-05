# MindVerse 产品介绍

> The universe inside you. | Many minds. One you.
> 版本：v0.1.0-draft | 日期：2026-09-01

## 这是什么

MindVerse 是一个「AI 人格聊天室」——把脑子里的几个声音请到一个房间里。

每个智能体拥有独立人格，交互形式类似微信：

- **单聊**：和一个人格 1:1 深聊
- **群聊**：把 N 个人格拉进一个群，@谁谁回应，或点「让大家聊聊」看他们自动交锋

纯浏览器本地运行，聊天记录与人格档案全存本地。

## 三个核心场景

| 场景 | 解释 | 用户价值 |
|------|------|----------|
| 决策 | 面对一个选择，把不同视角的人格拉群讨论 | 摆脱"一个人想破头"，获得多元视角 |
| 头脑风暴 | 面对一个创意问题，让不同人格各抒己见 | 突破单线思维，激发新想法 |
| 自我觉察 | 和自己的不同侧面（理性我 / 感性我 / 未来的我）对话 | 看见内心真实的声音 |

## 核心特性

- **预设人格库**：内置毒舌评论家、理性分析师、魔鬼代言人、老板视角等 8+ 思维风格，开箱即聊
- **自定义人格**：名字、头像、性格标签、System Prompt 自由创建；人格级模型绑定（不同人格可用不同模型）；人格分组管理
- **混合群聊机制**：`@点名` 精准回应；「让大家聊聊」自动接龙数轮，你旁听或随时插话
- **多 Provider**：火山方舟 / OpenAI / Anthropic / 任意 OpenAI 兼容服务，随时切换
- **附件支持**：图片（多模态理解）/ 文本文件上传与粘贴，消息内预览、点击全屏
- **本地数据主权**：IndexedDB / SQLite 持久化，一键导出 / 导入 JSON 备份；API Key 不离开本机
- **皮肤主题**：内置 6 套皮肤（微信绿 / 墨夜 / 蓝色幻想 / 樱粉 / 哥特虚空 / 宣纸），设置里一键换肤，全界面即时切换

## 路线图

| 阶段 | 形态 | 状态 |
|------|------|------|
| v0.1 | 纯前端本地版（当前）：浏览器直连 LLM，数据存 IndexedDB | 已实现 |
| v0.2 | Rust 服务端（axum + SQLite）：多用户注册登录、多端同步、LLM 服务端代理（Key 不进浏览器）、单二进制 / Docker 部署 | 已实现 |
| v0.3 | 实时化：接龙在服务端运行（关页面不中断）、多端实时推送 | 规划中 |
| 桌面端 | Tauri 2 壳：内嵌 Rust server（单进程）、随机端口、/ark 透传、数据存系统应用目录 | 已实现（2026-09-05） |

技术细节见 doc/TechSpec.md 第二阶段章节（§12 起）。

## 命名由来

**MindVerse = Mind（心智） + Verse（宇宙 / 诗的韵律）**

- Verse 暗示"宇宙、生态"——每个人的内在都是一个完整的小宇宙
- 与 Meta 的外部 Verse（Horizon Worlds）形成对比：它们做外部虚拟世界，MindVerse 做内部心智世界

Slogan：`MindVerse — Many minds. One you.`

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS 4 + Zustand + Dexie (IndexedDB)
- **服务端**：Rust（axum + SQLx/SQLite + argon2 鉴权 + SSE 流式）
- **桌面端**：Tauri 2（内嵌 Rust server，单二进制）

## 快速开始

```bash
# 形态一：纯前端（浏览器直连 LLM，数据存 IndexedDB）
pnpm install
pnpm dev

# 形态二：Rust 服务端（多用户、LLM 服务端代理，监听 127.0.0.1:8787）
cd server && cargo run

# 形态三：Tauri 桌面端（单进程内嵌 server）
pnpm tauri dev
```

启动后：设置里添加模型服务（如火山方舟 OpenAI 兼容端点 + API Key），从人格库挑几个人格，开聊。

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [PRD.md](./PRD.md) | 产品需求：功能清单、优先级、用户流程 |
| [TechSpec.md](./TechSpec.md) | 技术架构：数据模型、LLM 接入层、群聊调度器 |
| [DesignSystem.md](./DesignSystem.md) | UI 设计：布局、色彩、组件规格、动效 |
| [TestCase.md](./TestCase.md) | 测试用例：手测清单 + 单元测试 |
| [ChangeLog.md](./ChangeLog.md) | 更新日志 |
