# MindVerse

> The universe inside you.
> Many minds. One you.

**MindVerse 是一个「AI 人格聊天室」**——把脑子里的几个声音请到一个房间里。

每个智能体拥有独立人格，交互形式类似微信：

- **单聊**：和一个人格 1:1 深聊
- **群聊**：把 N 个人格拉进一个群，`@谁`谁回应，或点「让大家聊聊」看他们自动交锋接龙

## 核心特性

- **预设人格库**：内置毒舌评论家、理性分析师、魔鬼代言人、老板视角等 8+ 思维风格，开箱即聊
- **自定义人格**：名字、头像、性格标签、System Prompt 自由创建；人格级模型绑定（不同人格可用不同模型）；人格分组管理
- **混合群聊机制**：`@点名` 精准回应；「让大家聊聊」自动接龙数轮，你旁听或随时插话
- **多 Provider**：火山方舟 / OpenAI / Anthropic / 任意 OpenAI 兼容服务，随时切换
- **附件支持**：图片（多模态理解）/ 文本文件上传与粘贴，消息内预览、点击全屏
- **皮肤主题**：内置 6 套皮肤（微信绿 / 墨夜 / 蓝色幻想 / 樱粉 / 哥特虚空 / 宣纸），一键换肤全界面即时切换
- **数据主权**：本地 SQLite 存储，API Key 不离开本机

## 三个核心场景

| 场景 | 解释 | 用户价值 |
|------|------|----------|
| 决策 | 面对一个选择，把不同视角的人格拉群讨论 | 摆脱「一个人想破头」，获得多元视角 |
| 头脑风暴 | 面对一个创意问题，让不同人格各抒己见 | 突破单线思维，激发新想法 |
| 自我觉察 | 和自己的不同侧面（理性我 / 感性我 / 未来的我）对话 | 看见内心真实的声音 |

## 三种运行形态

| 形态 | 说明 | 启动方式 |
|------|------|----------|
| 纯前端 | 浏览器直连 LLM，数据存 IndexedDB | `pnpm install && pnpm dev` |
| 服务端 | Rust（axum + SQLite）：多用户注册登录、多端同步、LLM 服务端代理 | `cd server && cargo run`，前端 `pnpm dev` 连 `127.0.0.1:8787` |
| 桌面端 | Tauri 2 壳：内嵌 Rust server（单进程）、随机端口、数据存系统应用目录 | `pnpm tauri dev` |

## 技术栈

**前端**：React 18 + TypeScript + Vite + Tailwind CSS 4 + Zustand + Dexie (IndexedDB) + lucide-react
**服务端**：Rust（axum + SQLx/SQLite + argon2 鉴权 + SSE 流式）
**桌面端**：Tauri 2（macOS 自定义红绿灯 / 全局拖拽 / Overlay 标题栏）

## 路线图

| 阶段 | 形态 | 状态 |
|------|------|------|
| v0.1 | 纯前端本地版 | ✅ 已实现 |
| v0.2 | Rust 服务端：多用户、多端同步、LLM 代理 | ✅ 已实现 |
| 桌面端 | Tauri 2 桌面应用 | ✅ 已实现 |
| v0.3 | 实时化：接龙在服务端运行（关页面不中断）、多端实时推送 | 🚧 规划中 |

## 命名由来

**MindVerse = Mind（心智） + Verse（宇宙 / 诗的韵律）**——每个人的内在都是一个完整的小宇宙。与 Meta 做的外部虚拟世界（Horizon Worlds）相对，MindVerse 做内部心智世界。

Slogan：`MindVerse — Many minds. One you.`

## 文档

- [产品需求 PRD](./doc/PRD.md)
- [技术架构 TechSpec](./doc/TechSpec.md)
- [UI 设计 DesignSystem](./doc/DesignSystem.md)
- [测试用例 TestCase](./doc/TestCase.md)
- [产品介绍 Readme](./doc/Readme.md)
- [更新日志 ChangeLog](./doc/ChangeLog.md)

## License

Private — All rights reserved.
