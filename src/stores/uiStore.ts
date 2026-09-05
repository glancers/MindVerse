import { create } from 'zustand'
import type { Persona } from '../types'

export type ConversationSetupMode = 'private' | 'group' | 'group-edit'
export type MainView = 'chat' | 'contacts' | 'favorites'

/** 消息多选模式（微信式：勾选多条 → 收藏） */
export interface MessageSelection {
  convId: string
  ids: string[]
}

interface UIState {
  mainView: MainView
  sidebarCollapsed: boolean
  settingsOpen: boolean
  personaManagerOpen: boolean
  personaManagerInitial: Persona | null
  conversationSetup: { mode: ConversationSetupMode; convId?: string } | null
  selection: MessageSelection | null
  setMainView: (v: MainView) => void
  toggleSidebar: () => void
  openSettings: () => void
  closeSettings: () => void
  openPersonaManager: (initial?: Persona | null) => void
  closePersonaManager: () => void
  openConversationSetup: (mode: ConversationSetupMode, convId?: string) => void
  closeConversationSetup: () => void
  startSelection: (convId: string) => void
  toggleSelected: (messageId: string) => void
  stopSelection: () => void
}

export const useUIStore = create<UIState>((set) => ({
  mainView: 'chat',
  sidebarCollapsed: false,
  settingsOpen: false,
  personaManagerOpen: false,
  personaManagerInitial: null,
  conversationSetup: null,
  selection: null,
  setMainView: (v) => set({ mainView: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openPersonaManager: (initial = null) => set({ personaManagerOpen: true, personaManagerInitial: initial }),
  closePersonaManager: () => set({ personaManagerOpen: false, personaManagerInitial: null }),
  openConversationSetup: (mode, convId) => set({ conversationSetup: { mode, convId } }),
  closeConversationSetup: () => set({ conversationSetup: null }),
  startSelection: (convId) => set({ selection: { convId, ids: [] } }),
  toggleSelected: (messageId) =>
    set((s) => {
      if (!s.selection) return s
      const ids = s.selection.ids.includes(messageId)
        ? s.selection.ids.filter((x) => x !== messageId)
        : [...s.selection.ids, messageId]
      return { selection: { ...s.selection, ids } }
    }),
  stopSelection: () => set({ selection: null }),
}))
