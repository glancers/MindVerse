import { useEffect, useRef, useState } from 'react'
import { MessageCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PenLine, Send, Sparkles, Star, Users } from 'lucide-react'
import { LogoIcon } from './NavRail'
import { useChatStore } from '../stores/chatStore'
import { usePersonaStore } from '../stores/personaStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { favoritable, snapshotItem, useFavoriteStore } from '../stores/favoriteStore'
import { ASSISTANT_PERSONA } from '../utils/assistant'
import { isDesktopApp } from '../utils/desktop'
import Avatar from './common/Avatar'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import type { Conversation, Persona } from '../types'

/** 微信式时间分隔条格式：今天 HH:MM / 昨天 HH:MM / M月D日 HH:MM */
function formatDivider(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return hm
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function TimeDivider({ ts }: { ts: number }) {
  return (
    <div className="flex justify-center py-2 select-none">
      <span className="text-xs text-mv-ink-5 bg-mv-divider px-2 py-0.5 rounded">{formatDivider(ts)}</span>
    </div>
  )
}

function Header({ conv, members }: { conv: Conversation; members: Persona[] }) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const openConversationSetup = useUIStore((s) => s.openConversationSetup)
  const openPersonaManager = useUIStore((s) => s.openPersonaManager)
  const updateGroup = useChatStore((s) => s.updateGroup)
  const persona = members.find((p) => p.id === conv.personaIds[0])
  const isGroup = conv.type === 'group'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setDraft(conv.title)
    setEditing(true)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    const title = draft.trim()
    if (title && title !== conv.title) void updateGroup(conv.id, { title })
    setEditing(false)
  }

  return (
    <div className="relative h-[54px] shrink-0 border-b border-mv-border bg-mv-bg flex items-center px-4">
      <button
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
        title={sidebarCollapsed ? '展开会话列表' : '收起会话列表'}
        className="w-8 h-8 mr-1 rounded flex items-center justify-center text-mv-ink-3 hover:text-mv-ink hover:bg-mv-hover shrink-0"
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} strokeWidth={1.8} /> : <PanelLeftClose size={18} strokeWidth={1.8} />}
      </button>
      {/* 标题单行居左；群聊 hover 出现编辑按钮，点击改名 */}
      <div className="group/title flex items-center min-w-0 max-w-[60%] gap-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // 通用约定：所有文本输入框支持 cmd/ctrl+A 全选
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault()
                e.currentTarget.select()
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(false)
              }
            }}
            className="text-[16px] text-mv-ink leading-tight bg-mv-panel border border-mv-accent rounded px-1.5 py-0.5 outline-none min-w-0 w-[200px]"
          />
        ) : (
          <span className="text-[16px] text-mv-ink truncate leading-tight">
            {conv.title}
            {isGroup && <span className="text-mv-ink-4 text-[14px]">（{members.length}）</span>}
          </span>
        )}
        {isGroup && !editing && (
          <button
            onClick={startEdit}
            aria-label="编辑群名称"
            title="编辑群名称"
            className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-mv-ink-4 hover:text-mv-ink hover:bg-mv-hover opacity-0 group-hover/title:opacity-100 transition-opacity"
          >
            <PenLine size={13} strokeWidth={2} />
          </button>
        )}
      </div>
      {conv.type !== 'assistant' && (
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() =>
              conv.type === 'group'
                ? openConversationSetup('group-edit', conv.id)
                : openPersonaManager(persona)
            }
            aria-label="更多"
            title={conv.type === 'group' ? '管理群聊' : '查看资料'}
            className="w-9 h-9 rounded flex items-center justify-center text-mv-ink-3 hover:bg-mv-hover"
          >
            <MoreHorizontal size={22} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}

/** 未选中会话时的欢迎页：上介绍 + 下输入框（Codex 式），输入直接发往「AI 助手」会话 */
function EmptyState() {
  const providers = useSettingsStore((s) => s.providers)
  const openSettings = useUIStore((s) => s.openSettings)
  const createAssistant = useChatStore((s) => s.createAssistant)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const gen = useChatStore((s) => s.gen)
  const [value, setValue] = useState('')

  const canSend = value.trim().length > 0 && !gen.active

  const send = async () => {
    const text = value.trim()
    if (!text || gen.active) return
    setValue('')
    const convId = await createAssistant()
    await sendUserMessage(convId, text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 通用约定：所有文本输入框支持 cmd/ctrl+A 全选
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      e.currentTarget.select()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  const features = [
    { icon: MessageCircle, title: '私聊', desc: '与性格各异的人格一对一对话' },
    { icon: Users, title: '群聊', desc: '拉多个 AI 进群，看他们互相讨论' },
    { icon: Sparkles, title: 'AI 助手', desc: '不用选人格，直连默认模型开聊' },
  ]

  return (
    <div className="flex-1 flex flex-col bg-mv-bg min-w-0">
      {/* 桌面端顶部拖拽条：与聊天 Header 同高，未选中会话时也可拖动窗口 */}
      {isDesktopApp && <div className="h-[54px] shrink-0" data-tauri-drag-region />}
      {/* 上：产品介绍 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6 pb-6">
        <div className="w-16 h-16 rounded-[16px] bg-gradient-to-br from-[var(--mv-logo-from)] to-[var(--mv-logo-to)] flex items-center justify-center text-white shadow-lg shadow-mv-accent/20">
          <LogoIcon size={34} />
        </div>
        <div>
          <div className="text-lg font-semibold text-mv-ink">MindVerse</div>
          <p className="text-sm text-mv-ink-4 mt-1.5 max-w-[360px]">
            你的多人格 AI 聊天宇宙——私聊、群聊、AI 圆桌，都在一个熟悉的聊天界面里
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-3 mt-2">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-2 text-left">
              <div className="w-8 h-8 rounded-lg bg-mv-accent-soft flex items-center justify-center shrink-0">
                <f.icon size={15} className="text-mv-accent" />
              </div>
              <div>
                <div className="text-[13px] font-medium text-mv-ink">{f.title}</div>
                <div className="text-xs text-mv-ink-4 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 下：对话框 */}
      <div className="shrink-0 px-6 pb-8 flex justify-center">
        {providers.length === 0 ? (
          <div className="w-full max-w-[560px] text-center">
            <p className="text-sm text-mv-ink-4">先添加一个模型服务，就可以开始对话了</p>
            <button
              onClick={openSettings}
              className="mt-3 bg-mv-accent text-white text-sm px-5 py-2 rounded-lg hover:bg-mv-accent-hover transition-colors"
            >
              添加模型服务
            </button>
          </div>
        ) : (
          <div className="w-full max-w-[560px] rounded-2xl border border-mv-border bg-mv-panel shadow-sm p-3.5 focus-within:border-mv-accent transition-colors">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="有什么想聊的？直接发给 AI 助手…"
              className="w-full resize-none bg-transparent text-[15px] leading-[22px] outline-none placeholder:text-mv-ink-5 px-1"
            />
            <div className="flex items-center justify-between pt-1.5">
              <span className="text-xs text-mv-ink-5 px-1">Enter 发送 · Shift+Enter 换行 · 直连默认模型</span>
              <button
                onClick={() => void send()}
                disabled={!canSend}
                aria-label="发送"
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-colors ${
                  canSend
                    ? 'bg-mv-accent text-white hover:bg-mv-accent-hover'
                    : 'bg-mv-accent text-white opacity-30 cursor-not-allowed'
                }`}
              >
                <Send size={14} />
                发送
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** 多选模式底部操作栏：收藏所选 / 取消（微信式） */
function SelectionBar({ conv, members }: { conv: Conversation; members: Persona[] }) {
  const selection = useUIStore((s) => s.selection)!
  const stopSelection = useUIStore((s) => s.stopSelection)
  const addFavorite = useFavoriteStore((s) => s.add)
  const messages = useChatStore((s) => s.messages[conv.id] ?? [])

  const chosen = messages
    .filter((m) => selection.ids.includes(m.id) && favoritable(m))
    .sort((a, b) => a.createdAt - b.createdAt)
  const nameOf = (m: (typeof messages)[number]) =>
    m.role === 'user'
      ? '我'
      : members.find((p) => p.id === m.senderPersonaId)?.name ?? (conv.type === 'assistant' ? 'AI 助手' : '未知')

  const doFavorite = async () => {
    await addFavorite(chosen.map((m) => snapshotItem(m, nameOf(m))), conv)
    stopSelection()
  }

  return (
    <div className="h-[86px] shrink-0 border-t border-mv-border bg-mv-bg flex items-center justify-center gap-3 px-6">
      <button
        onClick={() => void doFavorite()}
        disabled={!chosen.length}
        className={`flex items-center gap-1.5 text-white text-sm px-6 py-2 rounded-lg ${
          chosen.length
            ? 'bg-mv-accent hover:bg-mv-accent-hover transition-colors'
            : 'bg-mv-accent opacity-30 cursor-not-allowed'
        }`}
      >
        <Star size={15} />
        收藏{chosen.length > 0 ? `（${chosen.length}）` : ''}
      </button>
      <button
        onClick={stopSelection}
        className="border border-mv-border bg-mv-panel text-mv-ink text-sm px-6 py-2 rounded-lg hover:bg-mv-hover transition-colors"
      >
        取消
      </button>
    </div>
  )
}

export default function ChatWindow() {
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === s.activeId))
  const messages = useChatStore((s) => (s.activeId ? s.messages[s.activeId] : undefined))
  const personas = usePersonaStore((s) => s.personas)
  const activeId = useChatStore((s) => s.activeId)
  const selecting = useUIStore((s) => (s.selection ? s.selection.convId === activeId : false))
  const scrollRef = useRef<HTMLDivElement>(null)

  const list = messages ?? []
  const last = list[list.length - 1]
  const lastLen = last?.content.length ?? 0

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [list.length, lastLen])

  if (!conv) return <EmptyState />

  // assistant 会话没有真实成员，用展示用虚拟人格兜底（头像/名称）
  const isAssistant = conv.type === 'assistant'
  const members = isAssistant ? [ASSISTANT_PERSONA] : personas.filter((p) => conv.personaIds.includes(p.id))
  const isGroup = conv.type === 'group'

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <Header conv={conv} members={members} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-mv-bg">
        <div className="w-full px-4 py-3 flex flex-col gap-1">
          {list.map((m, i) => {
            const prev = list[i - 1]
            const showTime = i === 0 || m.createdAt - (prev?.createdAt ?? 0) > 3 * 60 * 1000
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                {showTime && <TimeDivider ts={m.createdAt} />}
                <MessageBubble
                  message={m}
                  persona={members.find((p) => p.id === m.senderPersonaId) ?? (isAssistant ? ASSISTANT_PERSONA : undefined)}
                  isGroup={isGroup}
                  members={members}
                  conv={conv}
                />
              </div>
            )
          })}
          {!list.length && (
            <div className="text-center text-[13px] text-mv-ink-4 mt-16">
              {isGroup ? '发条消息 @某位成员，或点「让大家聊聊」开启讨论' : '打个招呼吧'}
            </div>
          )}
        </div>
      </div>
      {selecting ? <SelectionBar conv={conv} members={members} /> : <ChatInput conv={conv} members={members} />}
    </div>
  )
}
