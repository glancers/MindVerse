import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pin, PinOff, Plus, Search, Trash2, Download } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { usePersonaStore } from '../stores/personaStore'
import { useUIStore } from '../stores/uiStore'
import { confirmDialog } from '../stores/confirmStore'
import { formatTime } from '../utils/time'
import { ASSISTANT_PERSONA } from '../utils/assistant'
import { isDesktopApp } from '../utils/desktop'
import Avatar from './common/Avatar'
import type { Conversation, Persona } from '../types'

function GroupAvatar({ members }: { members: Persona[] }) {
  const first4 = members.slice(0, 4)
  return (
    <div className="w-[40px] h-[40px] rounded-[5px] bg-mv-panel border border-mv-border grid grid-cols-2 grid-rows-2 gap-[1px] p-[2px] shrink-0">
      {first4.map((p) => (
        <div key={p.id} className="flex items-center justify-center overflow-hidden">
          <Avatar persona={p} size={18} />
        </div>
      ))}
    </div>
  )
}

interface MenuItem {
  label: string
  icon: React.ReactNode
  danger?: boolean
  onClick: () => void
}

/** 会话右键菜单（微信 mac 风格） */
function ConvContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.min(x, innerWidth - rect.width - 8),
      top: Math.min(y, innerHeight - rect.height - 8),
    })
  }, [x, y])

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-mv-panel rounded-md shadow-lg border border-mv-border py-1 w-44"
      style={pos}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-mv-hover ${
            item.danger ? 'text-mv-danger' : 'text-mv-ink'
          }`}
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}

function ConvItem({ conv, onMenu }: { conv: Conversation; onMenu: (e: React.MouseEvent, conv: Conversation) => void }) {
  const active = useChatStore((s) => s.activeId === conv.id)
  const select = useChatStore((s) => s.select)
  const messages = useChatStore((s) => s.messages[conv.id])
  const personas = usePersonaStore((s) => s.personas)
  const members = personas.filter((p) => conv.personaIds.includes(p.id))
  const last = messages?.[messages.length - 1]

  let snippet = ''
  if (last) {
    const prefix =
      conv.type === 'group' && last.role === 'assistant'
        ? `${members.find((p) => p.id === last.senderPersonaId)?.name ?? ''}：`
        : ''
    snippet = prefix + last.content.replace(/\n/g, ' ')
  }
  if (snippet.length > 28) snippet = snippet.slice(0, 28) + '…'

  return (
    <div
      onClick={() => select(conv.id)}
      onContextMenu={(e) => onMenu(e, conv)}
      className={`group flex items-center gap-3 mx-2 my-0.5 px-2.5 py-2.5 rounded-lg cursor-pointer ${
        active ? 'bg-mv-rail-active' : 'hover:bg-mv-rail-hover'
      }`}
    >
      {conv.type === 'group' ? (
        <GroupAvatar members={members} />
      ) : (
        <Avatar persona={conv.type === 'assistant' ? ASSISTANT_PERSONA : members[0]} size={40} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] text-mv-ink truncate leading-tight">{conv.title}</span>
          <span className="text-xs text-mv-ink-4 shrink-0 leading-tight">{formatTime(conv.updatedAt)}</span>
        </div>
        <div className="text-[13px] text-mv-ink-3 truncate mt-1 leading-tight h-5 flex items-center">
          <span className="truncate">{snippet}</span>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const conversations = useChatStore((s) => s.conversations)
  const removeConversation = useChatStore((s) => s.removeConversation)
  const patchConversationFlags = useChatStore((s) => s.patchConversationFlags)
  const openConversationSetup = useUIStore((s) => s.openConversationSetup)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const [menuOpen, setMenuOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: Conversation } | null>(null)
  const [foldOpen, setFoldOpen] = useState(false)

  const filtered = keyword.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(keyword.trim().toLowerCase()))
    : conversations

  const normal = filtered.filter((c) => !c.folded)
  const folded = filtered.filter((c) => c.folded)
  // 置顶在前，其余按更新时间（store 已保证倒序）
  const sorted = [...normal.filter((c) => c.pinned), ...normal.filter((c) => !c.pinned)]

  const openMenu = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, conv })
  }

  const doDelete = async (conv: Conversation) => {
    const ok = await confirmDialog({
      title: '删除会话',
      message: `确定删除「${conv.title}」吗？聊天记录将一并删除，不可恢复。`,
      danger: true,
      confirmText: '删除',
    })
    if (ok) void removeConversation(conv.id)
  }

  const menuItems = (conv: Conversation): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: conv.pinned ? '取消置顶' : '置顶',
        icon: conv.pinned ? <PinOff size={14} /> : <Pin size={14} />,
        onClick: () => void patchConversationFlags(conv.id, { pinned: !conv.pinned }),
      },
      {
        label: conv.folded ? '移出「折叠的聊天」' : '收进「折叠的聊天」',
        icon: <Download size={14} />,
        onClick: () => void patchConversationFlags(conv.id, { folded: !conv.folded }),
      },
      {
        label: '删除',
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => void doDelete(conv),
      },
    ]
    return items
  }

  return (
    <div
      className={`bg-mv-side flex flex-col shrink-0 h-full transition-[width] duration-200 ${
        collapsed ? 'w-0 overflow-hidden' : 'w-[280px] border-r border-mv-border/60'
      }`}
    >
      <div className="h-[54px] px-3 flex items-center gap-2 shrink-0">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mv-ink-4" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索"
            className="w-full bg-mv-panel rounded-[4px] border border-transparent focus:border-mv-accent pl-8 pr-3 py-1.5 text-sm outline-none text-mv-ink transition-colors"
          />
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="新会话"
          title="新会话"
          className="w-8 h-8 rounded flex items-center justify-center text-mv-ink hover:bg-mv-rail-hover"
        >
          <Plus size={18} strokeWidth={1.8} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-[48px] right-3 z-20 bg-mv-panel rounded-lg shadow-lg border border-mv-border py-1 w-36">
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-mv-hover text-mv-ink"
                onClick={() => {
                  setMenuOpen(false)
                  openConversationSetup('private')
                }}
              >
                发起私聊
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm hover:bg-mv-hover text-mv-ink"
                onClick={() => {
                  setMenuOpen(false)
                  openConversationSetup('group')
                }}
              >
                发起群聊
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map((c) => (
          <ConvItem key={c.id} conv={c} onMenu={openMenu} />
        ))}
        {folded.length > 0 && (
          <div>
            <button
              className="w-full flex items-center gap-1.5 px-4 py-2 text-[13px] text-mv-ink-4 hover:text-mv-ink"
              onClick={() => setFoldOpen((v) => !v)}
            >
              {foldOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              折叠的聊天（{folded.length}）
            </button>
            {foldOpen && folded.map((c) => <ConvItem key={c.id} conv={c} onMenu={openMenu} />)}
          </div>
        )}
        {!filtered.length && (
          <div className="text-center text-[13px] text-mv-ink-4 mt-10 px-6">
            {keyword ? '没有匹配的会话' : '还没有会话，点击 + 发起对话'}
          </div>
        )}
      </div>
      {ctxMenu && (
        <ConvContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems(ctxMenu.conv)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
