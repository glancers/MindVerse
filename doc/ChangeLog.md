# MindVerse 更新日志

## 2026-09-05

### 2026-09-05 17:26 更新

- 【新增】项目初始化 Git 仓库并推送 GitHub（git@github.com:glancers/MindVerse.git）
- 【重写】根 README.md：补全三种运行形态（纯前端 / Rust 服务端 / Tauri 桌面端）、技术栈、路线图、文档索引
- 【修改】doc/Readme.md 同步 v0.2 现状：附件支持、人格分组、三种形态快速开始（原「纯浏览器本地运行」「快速开始（规划）」表述已过时）
- 【加固】根 .gitignore：补 server/target、server/data（数据库含 API Key 严禁提交）、*.log、.trae/.claude 等 IDE 私有配置

## 2026-09-05

### 2026-09-05 17:23 更新

- 【删除】「人格库」弹窗列表层（PersonaManager 网格卡片列表）：通讯录视图已完全取代其职能，列表层不再使用
- 【修改】PersonaManager 弹窗精简为纯表单：带人格打开 = 编辑；无初始值打开 = 直接进「新建人格」表单（原需先过列表层再点新建，少一步）；保存/取消/删除后直接关闭弹窗
- 【修改】导航栏 LOGO 按钮原「打开人格库」改为跳转通讯录视图（人格管理主界面）
- 【验证】tsc --noEmit 零错误

## 2026-09-05

### 2026-09-05 21:20 更新

- 【修复】附件发送 Bug：ChatInput.tsx 的 send() 此前只传文本、未带上 pending 附件且未清空，导致选中的文件永远发不进对话框；现在发送时携带附件并同步清空预览列表（纯附件无文本也可发送）
- 【验证】tsc 零错误

## 2026-09-05

### 2026-09-05 17:50 更新

- 【修改】桌面端拖拽升级为全局策略（App.tsx useGlobalDragBand）：窗口内任意非交互区域 mousedown 即可拖动，不再局限顶部 54px；豁免规则 = 标准交互标签（button/input/textarea/select/a/option/label/[role=button]/contenteditable）+ 祖先链计算样式 cursor:pointer + data-no-drag 属性
- 【约定】可点击自定义元素必须带 cursor-pointer（Tailwind cursor-pointer），否则会被全局拖拽劫持；不可拖的白名单外区域用 data-no-drag 豁免

## 2026-09-05

### 2026-09-05 17:35 更新

- 【新增】桌面端全局拖拽兜底（App.tsx useGlobalDragBand）：顶部 54px 内 mousedown 命中非交互元素（button/input/textarea/select/a/option/label/[role=button]/contenteditable 除外）自动 startDragging；新模块无需逐视图挂 data-tauri-drag-region，顶部空白永远可拖
- 【新增】通讯录详情栏、收藏列表栏顶部补 54px 拖拽条，与聊天 Header 对齐；至此所有视图所有栏顶部均支持拖动
- 【约定】写入项目记忆：新模块 Header 高度保持 54px 与全局拖拽带对齐；红绿灯参数在 src-tauri/src/main.rs 的 DOT/GAP/RAIL_W 调
- 【验证】tsc 零错误

## 2026-09-05

### 2026-09-05 16:43 更新

- 【新增】桌面端沉浸式标题栏：`titleBarStyle: Overlay` + `hiddenTitle` 去掉原生标题栏（顶部 MindVerse 文字与独立一行不再显示），内容铺满窗口；红黄绿按钮 `trafficLightPosition` 挪入最左栏（NavRail 顶部预留 38px spacer，兼作 `data-tauri-drag-region` 窗口拖拽区；浏览器版布局不变）
- 【新增】红黄绿按钮缩小至 72%（微信同款手法）：macOS 无改尺寸公开 API，在 setup 里取 `standardWindowButton` 三个系统按钮，给 layer 设以中心为锚的缩放变换（objc2-app-kit + objc2-quartz-core），原生控件行为（关闭/最小化/全屏、hover 符号）全保留；仅 macOS 生效
- 【验证】tsc / cargo check（src-tauri）零错误

### 2026-09-05 16:30 更新

- 【新增】Tauri 2 桌面客户端（src-tauri/）：Rust server 以 lib 形式内嵌进 Tauri 进程（单进程免 sidecar），`pnpm tauri dev` 开发、`pnpm tauri build` 打包 .app/.dmg；图标由水墨山水背景生成
- 【改造】server crate 拆 lib + bin：`start_server(ServerConfig) -> u16` 绑定后立即返回实际端口（serve 后台跑）；独立运行入口 main.rs 行为不变（环境变量配置）
- 【新增】内嵌服务随机端口（127.0.0.1:0）：免配置、不与残留进程冲突；前端 `invoke('get_server_port')` 轮询获取后注入 serverBase（仅内存）；数据目录 `~/Library/Application Support/com.mindverse.desktop`，JWT 密钥落盘复用（重启登录态不失效），首次启动自动迁移 server/data 开发库
- 【新增】/ark 透传代理（server/src/ark.rs）：桌面端无 vite 代理，Rust 侧原样转发方舟请求（SSE 流式回传，请求体上限 50MB）；llm.rs 对相对路径 baseURL 自动补全方舟域名
- 【修改】前端桌面适配：utils/desktop.ts 探测 Tauri 环境；main.tsx 启动等内嵌服务就绪（10s 超时降级纯本地）；llm/client.ts resolveBase 补全相对 baseURL（streamChat/testProvider/fetchModels 三处）；设置面板桌面端隐藏「服务器地址」输入框
- 【修复】并行多模态改造遗留的编译错误：ChatMessage.content 类型 String → serde_json::Value（与 anthropic_content 转换对齐）
- 【验证】cargo check（server + src-tauri）零错误；tsc --noEmit 零错误；tauri dev 窗口正常拉起（AI 终端沙箱限制 ~/Library 写入，需用户本机验证数据目录）；lib 重构独立运行 /api 401 鉴权生效、/ark 透传返回上游真实 401（链路通）

## 2026-09-06

### 2026-09-06 00:11 更新

- 【新增】会话列表支持收起/展开：聊天窗口头部左侧新增切换按钮（PanelLeftClose/PanelLeftOpen 图标），收起时 Sidebar 宽度动画归零（200ms 过渡，隐藏右边框），展开恢复 280px；状态存 uiStore.sidebarCollapsed（会话级，不持久化）
- 【验证】tsc --noEmit 对本次改动零错误（SettingsDialog/client.ts 的 3 个错误来自并行 Tauri 改造中间态，与本次无关）

## 2026-09-05

### 2026-09-05 17:10 更新

- 【修复】空内容气泡不再出现：①用户消息无正文且无附件 → 整条不渲染；②AI 消息 done/stopped 态无正文/思考/附件 → 不渲染（error 态保留重试入口）；③流式首 token 前的空气泡+孤立光标改为三点打字动画（bg-current 随气泡文字色，无硬编码颜色）
- 【修复】Markdown 组件空内容直接返回 null，不再渲染空壳 .md-body div
- 【加固】sendUserMessage 入口拦截全空消息（无文本无附件），杜绝空消息落库
- 【验证】tsc 对本次改动零错误（SettingsDialog/client.ts 的 3 个错误来自并行 Tauri 改造中间态，与本次无关）

### 2026-09-05 23:59 更新

- 【新增】群聊标题 hover 出现编辑按钮（PenLine 图标），点击进入行内改名：Enter/失焦提交（空值或未改名不提交），Esc 取消；复用 updateGroup 持久化，样式走主题变量，输入框支持 cmd/ctrl+A 全选
- 【修复】favicon 颜色跟随主题：切主题时读当前生效的 `--mv-logo-from/to` 重新生成星球气泡 SVG（rAF 等 CSS 变量就绪，读不到时兜底默认渐变），替代 index.html 里写死的 classic 渐变；导航栏/欢迎页 LOGO 底色本就走主题变量无需改
- 【验证】tsc 对本次改动零错误（SettingsDialog.tsx / client.ts 存在并行改动的中间态错误，与本次无关）

### 2026-09-05 16:40 更新

- 【新增】聊天上传文件：输入框「文件」按钮选择 / 直接粘贴图片，附件条预览（图片缩略图 / 文件名+大小，可移除），随消息发送
- 【新增】附件随消息发给模型：图片走多模态格式（OpenAI image_url / Anthropic base64 source 自动转换），文本文件（txt/md/csv/json/代码等）内容以 [附件 名]…[/附件] 拼进正文，其他类型仅附文件名
- 【新增】消息气泡附件展示：图片缩略图（object-contain 不裁切）点击全屏预览（统一遮罩，Esc/点击关闭），文件卡片显示名称与大小
- 【限制】图片 ≤10MB、文本文件 ≤200KB、每条消息 ≤6 个附件，超限 toast 提示；纯附件消息（无文字）可直接发送
- 【后端】messages 表加 attachments 列（迁移 SQL + 存量库自动补列）；MessageDto/row_to_message/upsert 同步映射；消息持久化校验放宽为「content/thinking/attachments 不能同时为空」；llm.rs ChatMessage.content 改为 JSON Value 透传多模态数组，Anthropic 分支自动转换 image_url→base64 source
- 【验证】tsc / cargo check 零错误（本功能范围）；服务端已重启并完成补列

### 2026-09-05 23:30 更新

- 【新增】「AI 助手」会话类型（Conversation.type='assistant'）：无人格、直连全局默认模型（resolveModel 兜底），空状态输入框发送即自动创建/复用该会话
- 【优化】未选中会话的欢迎页重构为 Codex 式布局：上半部 MindVerse 介绍（logo + 一句话 slogan + 私聊/群聊/AI 助手三个特性点），下半部居中输入卡片（Enter 发送 / Shift+Enter 换行 / cmd+A 全选，空内容禁用发送）；未配置模型服务时仍显示「添加模型服务」引导
- 【修改】生成队列（GenState.queue / generateOne / runQueue）支持 personaId=null 的 assistant 分支；sendUserMessage / retryMessage 适配（assistant 消息无 senderPersonaId 时按 null 重试）
- 【适配】Sidebar 会话头像（assistant 用展示用虚拟人格 ASSISTANT_PERSONA，主题色头像「A」）、ChatWindow Header 隐藏「更多」按钮、ChatInput 生成中文案显示「AI 助手 正在输入…」
- 【验证】tsc --noEmit 零错误

### 2026-09-05 15:58 更新

- 【优化】分组选择改为自绘下拉（GroupPicker）：可输入新建分组 + 下拉点选已有分组/不分组（选中项高亮带勾），替代原生 datalist，样式走主题变量，点击外部自动收起
- 【修改】预设人格仅调整分组时原地移动（保留原 id 与预设标记，不建副本）；修改设定仍另存副本；预设提示文案同步更新
- 【验证】tsc --noEmit 零错误

### 2026-09-05 15:55 更新

- 【修改】LOGO 更换为「星球气泡」：手绘线性 SVG（气泡 + 带环星球，呼应思维宇宙），替换原 lucide Sparkles 图标；仍用主题渐变 `--mv-logo-from/to`，随皮肤切换
- 【修改】欢迎页顶部大 LOGO 同步替换为星球气泡（LogoIcon 从 NavRail 导出复用），特性点「AI 助手」仍用 Sparkles
- 【新增】index.html 加 SVG favicon（同款星球气泡 + 默认主题渐变底），此前浏览器标签页无图标
- 【验证】tsc --noEmit 零错误

### 2026-09-05 15:46 更新

- 【修复】流式结束后 content 仍为空（含纯空白）的消息不再落成 done 状态的塌陷空气泡：现判为失败，标记 status=error（红描边 + 重试按钮）并 toast「模型返回了空回复」，群聊队列遇空回复即暂停
- 【验证】tsc --noEmit 零错误

### 2026-09-05 15:45 更新

- 【新增】人格分组：Persona 加 `group?` 字段（可留空不分组），编辑/新建人格表单新增「分组」输入（datalist 联想已有分组名，最多 20 字，保存时 trim）
- 【新增】通讯录列表按分组渲染：未分组人格在前（无分组头），各分组带可折叠头部（chevron + 组名 + 数量，点击展开/收起，仅本地 UI 状态）
- 【后端】personas 表加 `group_name` 列（迁移 SQL + 存量库启动自动补列）；PersonaDto / row_to_persona / upsert SQL 同步映射，旧客户端不传 group 不报错（serde default）
- 【验证】tsc --noEmit / cargo build 零错误；服务端已重启并完成补列

### 2026-09-05 15:35 更新

- 【修复】思考型模型（reasoning 模型）输出空气泡：前后端原只提取 `choices[0].delta.content`，推理内容走 `reasoning_content` 被整体丢弃，流正常结束即落一条 status=done 的空消息；现前后端均识别并透传 reasoning
- 【新增】AI 消息展示「思考过程」可折叠块（Brain 图标 + 流式中显示"思考中…"，完成后默认收起；正文为空时保持展开），颜色全走主题变量
- 【前端】Message 类型加 `thinking?` 字段；streamChat 新增 `onReasoning` 回调（直连读 `delta.reasoning_content`，服务器模式读后端 `{"reasoning"}` SSE 事件）；chatStore 流式期间 patch thinking 并随完成落库
- 【后端】llm.rs 新增 `extract_reasoning` 并以 `{"reasoning"}` 事件转发；messages 表加 `thinking` 列（迁移 SQL + 存量库自动补列）；MessageDto/upsert 同步映射；消息持久化校验放宽为"content 与 thinking 不能同时为空"
- 【验证】cargo build / tsc --noEmit 零错误

### 2026-09-05 15:29 更新

- 【新增】AI 消息支持 Markdown 渲染：新增 `react-markdown` + `remark-gfm`（表格/删除线/任务列表）+ `remark-breaks`（单换行即换行），assistant 气泡由纯文本改为 Markdown 组件渲染，流式输出时实时渲染
- 【新增】common/Markdown 组件；index.css 新增 `.md-body` 样式块（标题/列表/引用/行内代码/代码块/表格/链接/分割线/图片），颜色全部走 `--mv-*` 主题变量随皮肤切换
- 【验证】tsc --noEmit 零错误

## 2026-09-01

### 2026-09-01 23:55 更新

- 【重构】背景壁纸与主题解耦：壁纸不再属于任何主题（移除 gothic 主题内置壁纸变量），改为独立背景库，任意主题可配任意壁纸，选择按主题记忆（localStorage mv-theme-bg）
- 【新增】背景壁纸库 7 项：无背景 / 雾林晨绿 / 深蓝极光 / 樱色柔光 / 水墨远山 / 星夜群山 / 哥特虚空（5 张新壁纸由文生图生成，1368×768，存 public/backgrounds/）
- 【新增】壁纸模式（html.has-bg）：选中背景后各大面板块（bg/rail/side/panel/气泡）自动切换为半透明 rgba，壁纸从各层透出；蒙层按壁纸明暗预设
- 【修复】classic/midnight/bluefantasy/sakura/gothic 缺 --mv-side 变量（侧栏透明化透出 body 背景色），全部补齐
- 【修改】设置「主题皮肤」改名为「主题与背景」，面板下半部为当前主题的背景选择区（缩略图 + 选中态）；主题卡片移除「壁纸」徽标
- 【验证】tsc 零错误

### 2026-09-01 19:01 更新

- 【新增】会话右键菜单（微信 mac 风格）：置顶/取消置顶、收进「折叠的聊天」/移出、删除（走 ConfirmDialog）；移除 hover 出现删除按钮的交互
- 【新增】折叠的聊天：列表底部可折叠分组（带数量），折叠会话仍可右键移出/点击打开
- 【新增】置顶：置顶会话固定在列表最前
- 【后端】conversations 表加 pinned / folded 列，存量库启动自动补列；DTO/路由同步映射
- 【验证】tsc / cargo check 零错误；服务端已重启并完成迁移

### 2026-09-01 18:03 更新

- 【新增】皮肤系统支持背景壁纸（DreamSkin 核心思路：一张 16:9 壁纸铺满整窗，UI 半透明浮在其上）：主题新增 `--mv-bg-image`（壁纸 URL）与 `--mv-bg-mask`（可读性蒙层）两个变量，body 铺图 cover + fixed，`body::before` 蒙层压暗；无壁纸的皮肤变量为 none 等价纯色
- 【新增】哥特虚空皮肤挂上 Codex-Dream-Skin 的 Gothic Void Crusade 壁纸（2560×1440，788K，存 `public/backgrounds/gothic-void-crusade.jpg`），其面板色（bg/rail/panel/hover/bubble-other/border）改为半透明 rgba，壁纸从各层透出
- 【前端】themes.ts 的 ThemeMeta 加 `background?` 元数据；设置「主题皮肤」面板：含壁纸的皮肤迷你预览直接显示壁纸缩略图（带压暗渐变）+「壁纸」小标识
- 【验证】pnpm build 零错误；curl 绕过代理验证 dev server 壁纸 200（787K 完整）；新增皮肤壁纸 = 图片放 public/backgrounds + 皮肤块加两个变量 + themes.ts 挂元数据，组件零改动

### 2026-09-01 17:21 更新

### 2026-09-01 18:03 更新

- 【修复】点击会话列表项整列跳动：消息原为点击时懒加载，未打开会话的摘要行高度塌缩，加载后撑高导致列表跳一下；改为启动时预载全部会话消息（chatStore.load），摘要从一开始就稳定
- 【修复】摘要行固定高度 h-5，hover 出现删除按钮（20px）时不再引起行高抖动

### 2026-09-01 17:55 更新

- 【修改】聊天区头部高度 64px → 54px，与会话列表搜索栏一致

### 2026-09-01 17:52 更新

- 【修改】设置按钮移到导航栏最底部（移出中间按钮组，flex-1 撑开占位，微信 mac 布局）

### 2026-09-01 17:49 更新

- 【修改】导航栏四图标改为线性描边风格（微信形状 + 细线，strokeWidth 1.7）：聊天=气泡、通讯录=卡片+人形、收藏=五角星、设置=齿轮；替换上一版实心剪影方案

### 2026-09-01 17:45 更新

- 【修改】导航栏四图标换成微信同款实心剪影风格（替换 lucide 细线描边）：聊天=实心气泡、通讯录=圆角卡片+人形镂空、收藏=实心五角星、设置=实心齿轮；颜色仍走 currentColor 主题变量（选中 accent / 未选中 ink-3）
- 【验证】tsc 零错误

### 2026-09-01 17:38 更新

- 【修复】按钮颜色与主题不一致：主按钮统一 bg-mv-accent（保存/登录 hover 用 accent-hover），次按钮统一 accent 描边（注册/导出导入备份/添加服务商，原为 mv-link 蓝色与 accent 绿混杂）
- 【新增】--mv-danger / --mv-success 功能色变量（:root 全主题统一），替换全部 9 处硬编码（#E5484D 危险 / #10B981 Toast 成功）
- 【修改】ConfirmHost 确认按钮：普通确认 bg-mv-accent（原 mv-link），危险确认 bg-mv-danger；Toaster 圆点 success 色走变量
- 【验证】grep 全 src 零硬编码色值残留（logo 渐变除外，走 --mv-logo-*）；tsc 零错误

### 2026-09-01 17:34 更新

- 【修改】输入区布局调整：文本框移到上方，工具栏（表情/截图/文件/聊天记录）与「发送(S)」按钮合并为底部同一行（左工具栏、右发送）；颜文字弹窗改为向上弹出
- 【验证】tsc 零错误

### 2026-09-01 17:34 更新

- 【修改】三栏色阶分离（微信式层次）：新增 --mv-side 会话列表栏色阶（导航栏最深 → 列表居中 → 聊天区最浅），6 套皮肤各配一档（classic #EDEDED/#F2F2F2/#F5F5F5 等）；此前 rail 与 sidebar 同色无层次
- 【修改】Sidebar / ContactsView 左栏 / FavoritesView 左栏统一切到 bg-mv-side，与聊天区明确区分
- 【验证】tsc 零错误

### 2026-09-01 17:32 更新

- 【修改】全站 UI 对齐微信 mac：聊天头部标题居中（群名+成员数+成员名单），移除死的语音/视频通话按钮，仅保留右上 ⋯
- 【修改】输入区改微信平铺式：去掉卡片边框，工具栏置顶（表情（可用）/截图/文件/聊天记录，微信 mac 同款四图标），多行文本区，绿色「发送(S)」右下角；移除死的语音/文件夹按钮，表情面板改为向下弹出
- 【修改】会话列表项改微信式：去掉分隔线，整行圆角高亮选中（mx-2 my-0.5 rounded-lg），行高加大；恢复 hover 删除入口（时间位置 hover 时切换为删除按钮，带 ConfirmDialog——主题重构时该入口丢失）
- 【修改】导航栏移除死的「表情」「更多」按钮，保留 聊天/通讯录/收藏/设置
- 【验证】tsc 零错误；气泡小尖角确认已由主题系统实现（.bubble-me/.bubble-other::after）

### 2026-09-01 17:25 更新

- 【修改】收藏页改微信式两栏布局：左栏（240px 浅灰）= 搜索框（白底圆角+放大镜，支持 cmd/ctrl+A 全选）+ 八分类列表（全部收藏/最近使用/链接/图片与视频/笔记/文件/聊天记录/位置，lucide 图标+数量徽标+浅绿选中态）；右栏白底 = 当前分类标题+计数+卡片列表
- 【新增】收藏搜索：按消息内容 / 发送者 / 来源会话标题模糊匹配，空态区分「无匹配」与「无收藏」
- 【新增】"最近使用"分类：Favorite 新增 lastUsedAt 字段，点击收藏卡片（跳回来源会话）即记为使用，按使用时间倒序；链接/图片视频/笔记/文件/位置为预留空态（当前收藏均为聊天记录类型）
- 【后端】favorites 表加 last_used_at 列；存量库启动自动补列（pragma_table_info 检查 + 条件 ALTER，解决 IF NOT EXISTS 不加列问题）；DTO/路由同步映射
- 【交互】收藏卡片整卡可点（使用+跳转来源），删除按钮 stopPropagation 防误触
- 【适配】FavoritesView 颜色全部收敛为主题变量（bg-mv-panel/bg-mv-accent-soft/text-mv-ink-* 等），与并行落地的皮肤主题系统对齐，深色皮肤下正常显示
- 【验证】tsc / cargo check 零错误；存量库补列验证通过；lastUsedAt 端到端（upsert → list 回传）通过，测试数据已清理

### 2026-09-01 17:02 更新

- 【新增】皮肤主题系统全量落地：CSS 变量（--mv-*）+ html[data-theme] 切换，Tailwind v4 `@theme inline` 映射出 `bg-mv-* / text-mv-* / border-mv-*` 工具类；设置弹窗新增「主题皮肤」面板（迷你色板预览 + 点击即切换 + 300ms 全局色彩渐变过渡）
- 【新增】内置 6 套皮肤：微信绿（默认）/ 墨夜（深色）/ 蓝色幻想（深蓝，参考 dsh-web）/ 樱粉 / 哥特虚空（暗紫，参考 Codex-Dream-Skin）/ 宣纸（米白+朱砂）；主题选择存 localStorage（mv-theme），main.tsx 首帧前 initTheme 防闪烁
- 【重构】全部 14 个 UI 组件硬编码颜色收敛为主题变量（导航栏/侧栏/气泡/输入区/弹窗/Toast/收藏/通讯录/人格库/设置等）；危险色 #E5484D 保持全主题统一，hover 底改 color-mix 透明色适配深色
- 【优化】UI 细腻化：气泡微阴影、主题化细滚动条（6px + color-mix）、::selection 跟随强调色、输入框/搜索框 focus 描边、动效统一 0.2s cubic-bezier 弹性曲线、body 抗锯齿渲染
- 【修复】ChatInput 潜在类型错误：`e.selectionStart` → `e.target.selectionStart`（tsc --noEmit 报出）
- 【验证】`pnpm build`（tsc + vite build）零错误通过；grep 全 src 无残留旧色值；dev 5175 在跑，HMR 即时生效
- 【教训】并行编辑同一文件再次出现竞态覆盖（本轮波及 10 个组件），最终以整文件重写收口——同文件多次修改必须串行

### 2026-09-01 17:02 更新

- 【新增】消息收藏全量落地（微信式）：单条收藏（消息 hover 星标）+ 多选收藏（hover「多选」进入勾选模式 → 底部栏「收藏(N)/取消」），收藏记录来源会话与发送者
- 【数据】快照式收藏：Favorite = 1..N 条消息快照（内容/角色/发送者名/时间）+ 来源会话标题快照，原消息、人格、会话删除后收藏仍完整可看；流式中/出错的消息不可收藏
- 【前端】Dexie 升 v2 加 favorites 表（备份导出/导入同步覆盖）；repo.ts 加 listFavorites/putFavorite/deleteFavorite（local-first 双写双读）；favoriteStore + syncAll 上行
- 【前端】新组件 FavoritesView（导航栏收藏入口）：卡片列表（最多预览 4 条 + 「等 N 条」）、来源会话/发送者/时间、hover 删除（ConfirmDialog 确认）、点来源跳回会话（会话已删则提示）；空态引导
- 【前端】uiStore 加 favorites 视图 + 消息多选状态（选择绑定单一会话，切换会话自动退出）；MessageBubble 多选态整条可点勾选（不可收藏的消息置灰）
- 【后端】favorites 表（幂等迁移，存量库启动自动补表）+ GET/POST /api/favorites + DELETE /api/favorites/{id}；items 存 JSON 快照，与 user_id 隔离，整条替换无合并冲突
- 【验证】tsc 零错误；cargo check 零警告；API 端到端（临时用户 upsert → list → delete → 空）通过后已清理测试数据

### 2026-09-01 15:59 更新

- 【修复】服务端数据"没迁过来"：旧进程误用调试库 /tmp/mv-test.db；已迁移至 server/data/mindverse.db（迁移前 sqlite3 核对：2 用户 / 4 人格 / 2 会话 / 1 消息 / 1 服务商，数据完整）
- 【修改】main.rs 默认 DATABASE_PATH 由 mindverse.db 改为 data/mindverse.db（项目内持久化，避免 /tmp 重启清空）；.gitignore 已覆盖 data/*.db*
- 【运维】服务端重启统一为：`cd server && JWT_SECRET=dev-secret cargo run`（固定 JWT_SECRET 保住登录态；8787 端口不变，与 vite 代理一致）
- 【验证】curl 全链路：直连 8787 / 经 vite 5175 代理均 401（未带 token 的正常响应）；新库 WAL 已生成，确认运行在新位置

### 2026-09-01 14:52 更新

- 【新增】P1-b 全量落地：LLM 服务端代理 + 前端双模式（本地/服务器），多端同步可用
- 【后端】新增 llm.rs：POST /api/chat SSE 流式代理（服务端持 Key 组包调上游，delta/done/error 事件透传，5 分钟 chunk 重置超时）、POST /api/chat/test 非流式延迟测试、GET /api/providers/{id}/models 模型列表代理；OpenAI 兼容 / Anthropic 双协议适配
- 【后端】Provider 更新语义：apiKey 留空 = 保持原 Key（服务器模式编辑不回显 Key）；上游连接前错误直接 HTTP 错误，连接后错误走 SSE error 事件
- 【前端】新增 services/repo.ts：Repository 双实现（未登录 = Dexie 本地，登录 = API），chatStore / personaStore / settingsStore 持久化全部改走 repo，UI 组件零改动
- 【前端】新增 stores/authStore.ts（JWT + 服务器地址 localStorage 持久化）+ services/api.ts（统一 fetch 封装：JWT 注入、错误归一、5 分钟超时）
- 【前端】llm/client.ts 增加服务器模式分支：streamChat / testProvider / fetchModels 登录后走后端代理；修复 readSSE 回调抛错被吞的隐患（JSON 解析与回调分离）
- 【前端】设置弹窗新增「服务器（多端同步）」区块：服务器地址 + 登录/注册/退出；登录后自动刷新切数据源；服务器模式编辑服务商时 Key 可留空
- 【配置】vite 新增 /api 代理 → 127.0.0.1:8787
- 【验证】curl 全链路：Key 留空保持原值、上游 401 错误正确透传（含上游报错原文）、不存在 provider 404、models 代理、chat/test 延迟格式修复；前后端 tsc / cargo clippy 零错误零警告
- 【修复】开发中两次并行编辑同一文件产生竞态覆盖（main.rs mod 声明、chat_test 错误格式串），已修复——后续同文件编辑一律串行

### 2026-09-01 13:58 更新

- 【新增】P1-a 服务端骨架落地（server/，Rust）：axum 0.8 + sqlx(SQLite/WAL) + JWT(argon2 哈希 + 30 天有效期)，启动自动跑幂等迁移（内嵌 include_str!，无需 sqlx-cli）
- 【新增】认证三接口：POST /api/auth/register、/login、GET /me；AuthUser 提取器统一 Bearer JWT 鉴权，无效/缺失 token 一律 401
- 【新增】业务 CRUD 全量：personas / conversations / messages（含 ?after= 增量拉取）/ providers / settings；DTO 与前端 types 严格 camelCase 对齐
- 【新增】多用户数据隔离：全表带 user_id，越权读改删一律 404（不暴露存在性）；providers 的 apiKey 只进不出（响应永不回传）
- 【新增】统一错误结构 `{error:{code,message}}`；数据库错误细节不外泄；CorsLayer 便于 dev 调试
- 【修复】开发中发现 baseURL 字段 camelCase 序列化为 baseUrl 导致反序列化失败，已用 serde rename 显式修正
- 【验证】curl 全链路通过：A-01~A-05（注册/登录/重名 409/无 token 401/伪造 token 401）、I-01~I-03（隔离、越权 404、Key 不回传）、消息增量拉取、设置读写；cargo check + clippy 零警告；数据库密码全部 argon2 哈希无明文

### 2026-09-01 13:48 更新

- 【新增】第二阶段架构设计定稿：Rust 服务端（axum + SQLite + sqlx + JWT/argon2）+ 保留现有 React 前端，目标多用户 / 多端同步 / 服务端 LLM 代理 / 单二进制部署
- 【修改】TechSpec.md 升 v0.2.0-draft：新增 §0 阶段划分、§12–§19（目标架构、后端选型、server/ 目录结构、全表带 user_id 的 Schema、API 设计、多端同步策略、前端改造清单、部署方案、P1a–P3 演进路线）
- 【修改】PRD.md：新增 §3.7 账号与多端同步（用户名密码 + JWT 30 天、数据隔离、Key 只存服务端）；非目标移除「多设备同步 / 账号系统」，补充二期条目
- 【修改】TestCase.md：新增 §8 服务端与认证手测用例（A-01–A-05 认证、I-01–I-06 隔离与 LLM 代理、M-01–M-03 多端与双模式）、§9 cargo test 单测（R-01–R-05），回归清单补二期项
- 【修改】Readme.md：新增路线图（v0.1 本地版已实现 → v0.2 Rust 服务端设计完成 → v0.3 实时化规划）
- 【决策】调度器（@点名/接龙）P1 留在前端，P2 再后移服务端；前端抽象 Repository 双模式（本地 Dexie / 服务器 API），未登录行为与一期完全一致

### 2026-09-01 13:39 更新

- 【修复】开发服务器端口漂移导致 IndexedDB 数据"消失"：vite.config.ts 固定端口 5175 + strictPort（被占用时报错而非悄悄换端口），数据永远绑定同一源
- 【新增】设置「通用」新增数据管理：导出备份（全量 5 表打包 JSON 下载，文件名含日期时间）、导入备份（选文件 → ConfirmDialog 覆盖确认 → 事务清空重建 → 自动刷新页面）
- 【修复】上轮 UI 重构遗留的两个类型错误：私聊标题栏「更多」按钮改为打开对方人格资料（原 'private-edit' 模式不存在）、NavRail 头像按钮 onClick 包箭头函数
- 【说明】浏览器同源策略下 IndexedDB 绑定「协议+域名+端口」，无法跨端口读取；换端口/浏览器请先导出备份再导入

### 2026-09-01 13:32 更新

- 【修改】按微信截图整体重构 UI：
  - 导航栏改窄为 52px 灰底（#EDEDED）：顶部渐变人格管理入口，聊天/通讯录/收藏/表情/设置/更多竖排图标，当前视图左侧微信绿竖条指示
  - 会话列表改 280px 灰底：白色搜索框+新会话(+)、会话项 40px 头像+底部分割线、选中态灰底 #D4D4D4
  - 聊天标题栏改左对齐（会话名+群成员数/成员名），右上角语音通话/视频/更多三按钮（私聊更多=查看资料，群聊更多=管理群聊）
  - 输入区改为白底圆角容器：内嵌 textarea + 底部工具栏（语音/表情/文件/文件夹/截图/聊天记录图标，左对齐）+ 绿色「发送(S)」
  - 时间分隔条改为灰色胶囊样式；气泡小尾巴改为 CSS 三角形；消息区满宽展示（去掉 max-w-4xl 居中）

### 2026-09-01 13:24 更新

- 【修改】表情按钮位置修正为微信布局：从输入域左侧移到输入域下方左下角，与「发送(S)」按钮同行（左表情、右发送），表情面板仍向上弹出

### 2026-09-01 13:22 更新

- 【修改】输入区对齐微信布局：左侧表情按钮（SVG Smile 图标）+ 无边框两行输入域（placeholder「请输入消息…」）+ 右下角绿色 #07C160 圆角矩形「发送(S)」按钮（替代原圆形箭头按钮）
- 【新增】表情面板：内置 10 个颜文字，点击在光标处插入输入框，点击外部 / Esc 关闭
- 【验证】无头浏览器实测：表情面板弹出、插入后发送按钮解锁，交互正常

### 2026-09-01 13:19 更新

- 【修改】对话页 UI 全面对齐微信风格：
  - 用户气泡改为微信绿 #95EC69（深色文字、8px 圆角、CSS 伪元素小尾巴），AI 气泡白底无边框带小尾巴
  - 消息两侧均有头像：AI 左侧 40px 圆角方形，用户右侧「我」头像；全局头像改为微信式 5px 圆角方形
  - 新增微信式时间分隔条：首条消息及间隔 >3 分钟时居中显示（今天 HH:MM / 昨天 / M月D日）
  - 群聊发送者名字改为微信式灰色小字（@提及高亮仍保留人格主题色）
  - 聊天区背景改为 #F5F5F5，标题栏白底居中（私聊头像+名字，群聊标题+成员、管理按钮靠右）
  - 输入区改为微信风格：无边框大输入域 + 绿色 #07C160 圆形发送按钮；「让大家聊聊」按钮同步绿色系
  - 空状态主按钮 / logo 底色改微信绿 #07C160

### 2026-09-01 13:12 更新

- 【新增】设置表单「获取模型列表」按钮：OpenAI 兼容走 GET /models、Anthropic 走 GET /v1/models 自动拉取；方舟 AgentPlan 端点不提供列表接口，失败时自动填入官方模型清单（doubao-seed 系列 / glm / deepseek / kimi / minimax 等 11 个）
- 【新增】Vite 本地代理 /ark → ark.cn-beijing.volces.com：解决方舟接口 CORS 不放行 Authorization 头导致浏览器直连被拦的问题；ark 类型默认 Base URL 改为 /ark/api/plan/v3（AgentPlan 端点）
- 【修复】Anthropic 协议路径修正为 {base}/v1/messages，并补 anthropic-dangerous-direct-browser-access 头允许浏览器直连
- 【验证】AgentPlan 全链路实测通过：测试连接 200、私聊流式回复正常（默认模型 doubao-seed-2.0-lite）

### 2026-09-01 13:02 更新

- 【新增】通讯录视图（微信式）：导航栏新增「聊天 / 通讯录」切换，通讯录为两栏布局——左栏人格列表（默认选中第一位），右栏人格详情（大头像、简介、标签、人格设定、绑定模型）
- 【新增】通讯录详情「发消息」按钮：一键创建/跳转到与该人格的私聊并切回聊天视图；「编辑」直接打开该人格的编辑表单
- 【修改】导航栏重构为独立 NavRail 组件：聊天 / 通讯录 / 设置三个入口，当前视图高亮
- 【修改】原「人格库」弹层入口移至通讯录（列表顶部「新建人格」+ 详情「编辑」），弹层支持带初始人格打开

### 2026-09-01 12:31 更新

- 【新增】P0 全量实现：Vite + React 18 + TS + Tailwind v4 + Zustand + Dexie 工程落地，构建通过
- 【新增】数据层：IndexedDB（personas / conversations / messages / providers / settings）+ 8 个预设人格自动初始化
- 【新增】LLM 接入层：OpenAI 兼容（火山方舟 / OpenAI / 自定义）与 Anthropic Messages 双协议，手写 SSE 流式解析，5 分钟超时（chunk 重置计时），连通性测试
- 【新增】群聊调度器：@提及解析（按出现顺序串行回复）、无人 @ 走默认主持人格、接龙模式（成员顺序 × N 轮、可随时停止、失败暂停不跳过）
- 【新增】UI：微信式三栏（导航栏 + 会话列表 + 聊天窗口）、人格主题色气泡、@提及选择浮层、接龙控制条（轮数步进 1–10）、流式光标、错误重试（弹窗确认）
- 【新增】人格库：预设 / 自定义人格 CRUD，预设编辑另存副本，人格级模型绑定，色块头像 + 图片头像（object-contain 不裁切）
- 【新增】设置：多 Provider 管理（Key 掩码显示）、全局默认模型、接龙默认轮数
- 【新增】通用约定落地：SVG 图标、×关闭、统一遮罩 bg-black/60 backdrop-blur-sm、createPortal ConfirmDialog / Toast、cmd/ctrl+A 全选、空输入 opacity-30、复制提示「已经复制到粘贴板」

### 2026-09-01 11:48 更新

- 【新增】项目设计阶段启动，创建 doc 目录及全套设计文档（v0.1.0-draft）
- 【新增】PRD.md：产品定位、预设 + 自建人格体系、私聊 / 群聊（@点名 + 接龙混合机制）、多 Provider 配置、P0/P1/P2 功能优先级
- 【新增】TechSpec.md：React + Vite + TS + Zustand + Dexie 纯前端架构；IndexedDB 数据模型；OpenAI / Anthropic 双协议 LLM 接入层（SSE 流式 + 5 分钟超时）；群聊串行调度器状态机；群聊 Prompt 注入方案
- 【新增】DesignSystem.md：微信式三栏布局、人格主题色体系（8 预设色 + 自动取色）、气泡 / @提及 / 接龙控制条 / 弹窗 Toast 组件规格、动效与无障碍约定
- 【新增】TestCase.md：人格 / 私聊 / 群聊 / Provider / 超时容错 / 数据管理 6 组手测用例 + 5 项 Vitest 单元测试 + 发版回归清单
- 【新增】doc/Readme.md：产品介绍（核心场景、特性、命名由来、快速开始）
- 【修改】根 README.md：精简为项目入口页，保留命名档案与品牌延展体系，正式产品介绍移至 doc/Readme.md
