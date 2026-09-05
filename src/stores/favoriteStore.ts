import { create } from 'zustand'
import type { Conversation, Favorite, FavoriteItem, Message } from '../types'
import { uid } from '../utils/id'
import * as repo from '../services/repo'
import { toast } from './toastStore'

/** 消息是否可收藏：已完成且内容非空（流式中/出错的不收） */
export function favoritable(m: Message): boolean {
  return (m.status === 'done' || m.status === 'stopped') && m.content.trim().length > 0
}

/** 生成消息快照（senderName 由调用方解析：'我' 或人格名） */
export function snapshotItem(m: Message, senderName: string): FavoriteItem {
  return {
    messageId: m.id,
    role: m.role,
    senderPersonaId: m.senderPersonaId,
    senderName,
    content: m.content,
    createdAt: m.createdAt,
  }
}

interface FavoriteState {
  favorites: Favorite[]
  loaded: boolean
  load: () => Promise<void>
  /** 收藏一条或多条消息（记录来源会话快照） */
  add: (items: FavoriteItem[], conv: Conversation) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 标记"最近使用"（查看/跳转来源时调用） */
  touch: (id: string) => Promise<void>
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: [],
  loaded: false,

  async load() {
    const favorites = await repo.listFavorites()
    set({ favorites, loaded: true })
  },

  async add(items, conv) {
    if (!items.length) return
    const fav: Favorite = {
      id: uid(),
      items: [...items].sort((a, b) => a.createdAt - b.createdAt),
      conversationId: conv.id,
      conversationTitle: conv.title,
      createdAt: Date.now(),
    }
    await repo.putFavorite(fav)
    set((s) => ({ favorites: [fav, ...s.favorites] }))
    toast.success(items.length > 1 ? `已收藏 ${items.length} 条消息` : '已收藏')
  },

  async remove(id) {
    await repo.deleteFavorite(id)
    set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) }))
  },

  async touch(id) {
    const fav = get().favorites.find((f) => f.id === id)
    if (!fav) return
    const next = { ...fav, lastUsedAt: Date.now() }
    set((s) => ({ favorites: s.favorites.map((f) => (f.id === id ? next : f)) }))
    await repo.putFavorite(next)
  },
}))
