import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  FileText,
  Image as ImageIcon,
  Link2,
  MapPin,
  MessageCircle,
  Search,
  Star,
  StickyNote,
  Trash2,
} from 'lucide-react'
import type { Favorite } from '../types'
import { useFavoriteStore } from '../stores/favoriteStore'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { usePersonaStore } from '../stores/personaStore'
import { confirmDialog } from '../stores/confirmStore'
import { toast } from '../stores/toastStore'
import { isDesktopApp } from '../utils/desktop'
import Avatar from './common/Avatar'

/** 左栏分类（微信收藏同款八分类；当前数据类型只有聊天记录，其余为预留空态） */
type CategoryKey = 'all' | 'recent' | 'link' | 'media' | 'note' | 'file' | 'chat' | 'location'

const CATEGORIES: { key: CategoryKey; label: string; icon: typeof Star }[] = [
  { key: 'all', label: '全部收藏', icon: Star },
  { key: 'recent', label: '最近使用', icon: Clock },
  { key: 'link', label: '链接', icon: Link2 },
  { key: 'media', label: '图片与视频', icon: ImageIcon },
  { key: 'note', label: '笔记', icon: StickyNote },
  { key: 'file', label: '文件', icon: FileText },
  { key: 'chat', label: '聊天记录', icon: MessageCircle },
  { key: 'location', label: '位置', icon: MapPin },
]

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return hm
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

/** 搜索匹配：内容 / 发送者 / 来源会话 */
function matchSearch(f: Favorite, q: string): boolean {
  if (!q) return true
  const hay = [
    ...f.items.map((it) => it.content),
    ...f.items.map((it) => it.senderName),
    f.conversationTitle,
  ]
    .join('\n')
    .toLowerCase()
  return hay.includes(q.toLowerCase())
}

function matchesCategory(f: Favorite, key: CategoryKey): boolean {
  switch (key) {
    case 'all':
    case 'chat': // 现有收藏全部是聊天记录快照
      return true
    case 'recent':
      return !!f.lastUsedAt
    default:
      return false // 链接/图片视频/笔记/文件/位置：暂无此类数据
  }
}

/** 单条收藏卡片：内容预览（多条全展示）+ 来源会话 + 操作；点击 = 使用并跳回来源 */
function FavoriteCard({ fav }: { fav: Favorite }) {
  const removeFavorite = useFavoriteStore((s) => s.remove)
  const touchFavorite = useFavoriteStore((s) => s.touch)
  const conversations = useChatStore((s) => s.conversations)
  const select = useChatStore((s) => s.select)
  const setMainView = useUIStore((s) => s.setMainView)
  const personas = usePersonaStore((s) => s.personas)

  const sourceAlive = conversations.some((c) => c.id === fav.conversationId)

  const doDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = await confirmDialog({
      title: '删除收藏',
      message: '确定删除这条收藏吗？（不影响原始消息）',
      danger: true,
      confirmText: '删除',
    })
    if (ok) void removeFavorite(fav.id)
  }

  const openFavorite = () => {
    void touchFavorite(fav.id)
    if (!sourceAlive) {
      toast.info('来源会话已被删除')
      return
    }
    select(fav.conversationId)
    setMainView('chat')
  }

  const senders = [...new Set(fav.items.map((it) => it.senderName || '未知'))]

  return (
    <div
      onClick={openFavorite}
      className="bg-mv-panel border border-mv-border rounded-xl p-4 flex flex-col gap-2.5 cursor-pointer hover:border-mv-accent/50 hover:shadow-sm transition-all group"
    >
      <div className="flex flex-col gap-2">
        {fav.items.slice(0, 4).map((it) => {
          const persona = personas.find((p) => p.id === it.senderPersonaId)
          const isMe = it.role === 'user'
          return (
            <div key={it.messageId} className="flex items-start gap-2.5">
              {isMe ? (
                <div className="w-8 h-8 rounded-[5px] bg-mv-self flex items-center justify-center text-white text-[13px] font-medium shrink-0 select-none">
                  我
                </div>
              ) : (
                <Avatar persona={persona} size={32} />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-mv-ink-4">{it.senderName || '未知'}</div>
                <div className="text-[14px] text-mv-ink leading-[22px] whitespace-pre-wrap break-words line-clamp-4 mt-0.5">
                  {it.content}
                </div>
              </div>
            </div>
          )
        })}
        {fav.items.length > 4 && (
          <div className="text-xs text-mv-ink-4 pl-[42px]">…等 {fav.items.length} 条消息</div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-mv-divider pt-2.5">
        <div className="flex items-center gap-1 text-xs text-mv-ink-4 truncate">
          <MessageCircle size={12} />
          {fav.conversationTitle}
          <span className="text-mv-ink-5">·</span>
          {senders.join('、')}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-mv-ink-5 mr-1">{formatTime(fav.createdAt)}</span>
          <button
            onClick={doDelete}
            aria-label="删除收藏"
            title="删除收藏"
            className="text-mv-ink-5 hover:text-mv-danger p-1 rounded-md hover:bg-mv-hover opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FavoritesView() {
  const favorites = useFavoriteStore((s) => s.favorites)
  const loaded = useFavoriteStore((s) => s.loaded)
  const load = useFavoriteStore((s) => s.load)

  const [category, setCategory] = useState<CategoryKey>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    void load()
  }, [load])

  /** 各分类数量（用于左侧徽标；无数据的分类不显示数量） */
  const counts = useMemo(() => {
    const c: Record<CategoryKey, number> = {
      all: favorites.length,
      recent: favorites.filter((f) => f.lastUsedAt).length,
      chat: favorites.length,
      link: 0,
      media: 0,
      note: 0,
      file: 0,
      location: 0,
    }
    return c
  }, [favorites])

  const list = useMemo(() => {
    const filtered = favorites.filter((f) => matchesCategory(f, category) && matchSearch(f, query))
    return filtered.sort((a, b) =>
      category === 'recent'
        ? (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
        : b.createdAt - a.createdAt,
    )
  }, [favorites, category, query])

  const activeLabel = CATEGORIES.find((c) => c.key === category)?.label ?? ''

  return (
    <div className="flex-1 flex min-w-0">
      {/* 左栏：搜索 + 分类（微信式） */}
      <div className="w-[240px] bg-mv-side border-r border-mv-border flex flex-col shrink-0 h-full">
        {/* 桌面端顶部拖拽条：与聊天 Header 同高对齐 */}
        {isDesktopApp && <div className="h-[54px] shrink-0" data-tauri-drag-region />}
        <div className="p-3">
          <div className="flex items-center gap-2 bg-mv-panel rounded-lg px-2.5 h-9 border border-transparent focus-within:border-mv-accent/40">
            <Search size={14} className="text-mv-ink-5 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
                  e.preventDefault()
                  e.currentTarget.select()
                }
              }}
              placeholder="搜索"
              className="w-full bg-transparent outline-none text-[13px] text-mv-ink placeholder:text-mv-ink-5"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5">
          {CATEGORIES.map(({ key, label, icon: Icon }) => {
            const active = category === key
            const count = counts[key]
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`w-full flex items-center gap-2.5 px-3 h-[38px] rounded-lg text-left text-[14px] transition-colors ${
                  active
                    ? 'bg-mv-accent-soft text-mv-accent font-medium'
                    : 'text-mv-ink hover:bg-mv-hover/60'
                }`}
              >
                <Icon size={16} strokeWidth={1.8} className="shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {count > 0 && <span className="text-xs text-mv-ink-5">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* 右栏：收藏列表 */}
      <div className="flex-1 min-w-0 bg-mv-panel overflow-y-auto">
        {/* 桌面端顶部拖拽条：与聊天 Header 同高对齐 */}
        {isDesktopApp && <div className="h-[54px] shrink-0" data-tauri-drag-region />}
        <div className="max-w-2xl mx-auto px-6 py-6">
          <h1 className="text-[17px] font-semibold text-mv-ink mb-4">
            {activeLabel}
            {list.length > 0 && (
              <span className="text-sm font-normal text-mv-ink-5 ml-2">{list.length}</span>
            )}
          </h1>
          {loaded && list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-24 text-center">
              <div className="w-14 h-14 rounded-full bg-mv-hover flex items-center justify-center">
                <Star size={26} className="text-mv-ink-5" />
              </div>
              <p className="text-sm text-mv-ink-4">
                {query
                  ? `没有匹配「${query}」的收藏`
                  : category === 'all'
                    ? '还没有收藏，Hover 消息点星标即可收藏'
                    : '该分类下暂无收藏'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((f) => (
                <FavoriteCard key={f.id} fav={f} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
