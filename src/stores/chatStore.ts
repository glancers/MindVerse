import { create } from 'zustand'
import type { Conversation, Message, MessageAttachment } from '../types'
import { uid } from '../utils/id'
import { logger } from '../utils/logger'
import * as repo from '../services/repo'
import { usePersonaStore } from './personaStore'
import { useUIStore } from './uiStore'
import { resolveModel } from './settingsStore'
import { toast } from './toastStore'
import { LLMError, LLMAbortedError, streamChat } from '../services/llm/client'
import { buildGroupMessages, buildGroupSystem, buildPrivateMessages } from '../services/prompt'
import { expandRoundQueue, parseMentions } from '../services/scheduler'

type GenResult = 'done' | 'stopped' | 'error'

export interface GenState {
  active: boolean
  mode: 'direct' | 'round'
  currentPersonaId?: string | null
  queue: (string | null)[]
  total: number
  done: number
}

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Record<string, Message[]>
  gen: GenState
  load: () => Promise<void>
  select: (id: string | null) => void
  ensureMessages: (convId: string) => Promise<void>
  createPrivate: (personaId: string) => Promise<void>
  createAssistant: () => Promise<string>
  createGroup: (title: string, personaIds: string[], hostPersonaId: string) => Promise<void>
  updateGroup: (
    convId: string,
    patch: Partial<Pick<Conversation, 'title' | 'personaIds' | 'hostPersonaId'>>,
  ) => Promise<void>
  removeConversation: (id: string) => Promise<void>
  patchConversationFlags: (
    id: string,
    patch: Partial<Pick<Conversation, 'pinned' | 'folded'>>,
  ) => Promise<void>
  sendUserMessage: (convId: string, text: string, attachments?: MessageAttachment[]) => Promise<void>
  startRound: (convId: string, rounds: number) => void
  stopGeneration: () => void
  retryMessage: (convId: string, msgId: string) => Promise<void>
  deleteMessage: (convId: string, msgId: string) => Promise<void>
}

const IDLE_GEN: GenState = { active: false, mode: 'direct', queue: [], total: 0, done: 0 }

let abortRef: AbortController | null = null

export const useChatStore = create<ChatState>((set, get) => {
  function appendMessage(msg: Message) {
    set((s) => ({
      messages: { ...s.messages, [msg.conversationId]: [...(s.messages[msg.conversationId] ?? []), msg] },
    }))
    void repo.putMessage(msg)
  }

  function patchMessage(convId: string, msgId: string, patch: Partial<Message>, persist = false) {
    set((s) => {
      const list = s.messages[convId] ?? []
      return {
        messages: {
          ...s.messages,
          [convId]: list.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
        },
      }
    })
    if (persist) {
      // 服务器模式 upsert 需要整条消息：从 store 取最新值提交
      const cur = (get().messages[convId] ?? []).find((m) => m.id === msgId)
      if (cur) void repo.putMessage(cur)
    }
  }

  function touchConversation(convId: string) {
    set((s) => ({
      conversations: s.conversations
        .map((c) => (c.id === convId ? { ...c, updatedAt: Date.now() } : c))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    const conv = get().conversations.find((c) => c.id === convId)
    if (conv) void repo.putConversation(conv)
  }

  /** 单次生成：追加占位消息 → 流式写入 → 落库；personaId 为 null 时走 assistant 会话（直连默认模型） */
  async function generateOne(convId: string, personaId: string | null, isRound: boolean): Promise<GenResult> {
    const conv = get().conversations.find((c) => c.id === convId)
    if (!conv) return 'error'
    const isAssistant = conv.type === 'assistant'
    const persona = personaId
      ? usePersonaStore.getState().personas.find((p) => p.id === personaId)
      : undefined
    if (!isAssistant && !persona) return 'error'
    const resolved = resolveModel(isAssistant ? undefined : persona)
    if (!resolved) {
      toast.error('未配置可用的模型服务，请先到设置中添加')
      return 'error'
    }
    const isGroup = conv.type === 'group'
    const members = usePersonaStore.getState().personas.filter((p) => conv.personaIds.includes(p.id))
    const history = get().messages[convId] ?? []
    const nameOf = (id: string) => members.find((p) => p.id === id)?.name
    const system = isAssistant
      ? ''
      : isGroup
        ? buildGroupSystem(persona!, conv, members, isRound)
        : persona!.systemPrompt
    const llmMessages = isGroup ? buildGroupMessages(history, nameOf) : buildPrivateMessages(history)

    const msg: Message = {
      id: uid(),
      conversationId: convId,
      role: 'assistant',
      senderPersonaId: persona?.id,
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    }
    appendMessage(msg)

    abortRef = new AbortController()
    let thinking = ''
    try {
      const content = await streamChat({
        provider: resolved.provider,
        model: resolved.model,
        system,
        messages: llmMessages,
        signal: abortRef.signal,
        onDelta: (t) => {
          const cur = (get().messages[convId] ?? []).find((m) => m.id === msg.id)
          if (cur) patchMessage(convId, msg.id, { content: cur.content + t })
        },
        onReasoning: (t) => {
          thinking += t
          patchMessage(convId, msg.id, { thinking })
        },
      })
      if (!content.trim()) {
        toast.error('模型返回了空回复')
        patchMessage(convId, msg.id, { content, thinking, status: 'error' }, true)
        return 'error'
      }
      patchMessage(convId, msg.id, { content, thinking, status: 'done' }, true)
      touchConversation(convId)
      return 'done'
    } catch (err) {
      if (err instanceof LLMAbortedError || abortRef?.signal.aborted) {
        patchMessage(convId, msg.id, { status: 'stopped' }, true)
        return 'stopped'
      }
      const message = err instanceof LLMError ? `${err.providerName}: ${err.message}` : '生成失败'
      logger.error('generate failed:', message)
      toast.error(message)
      patchMessage(convId, msg.id, { status: 'error' }, true)
      return 'error'
    }
  }

  /** 串行调度队列：绝并发，失败/停止即暂停（不自动跳过，由用户决定重试） */
  async function runQueue(convId: string, queue: (string | null)[], mode: 'direct' | 'round') {
    if (get().gen.active || queue.length === 0) return
    set({ gen: { active: true, mode, currentPersonaId: undefined, queue: [...queue], total: queue.length, done: 0 } })
    for (;;) {
      const nextId = get().gen.queue[0]
      if (nextId === undefined) break
      set((s) => ({ gen: { ...s.gen, currentPersonaId: nextId, queue: s.gen.queue.slice(1) } }))
      const result = await generateOne(convId, nextId, mode === 'round')
      if (result === 'done') {
        set((s) => ({ gen: { ...s.gen, done: s.gen.done + 1 } }))
        await new Promise((r) => setTimeout(r, 300))
      } else {
        break
      }
    }
    set({ gen: IDLE_GEN })
    abortRef = null
  }

  return {
    conversations: [],
    activeId: null,
    messages: {},
    gen: IDLE_GEN,

    async load() {
      const conversations = await repo.listConversations()
      set({ conversations })
      // 预载各会话消息：保证列表摘要行从一开始就稳定，避免点击时行高突变导致列表跳动
      const lists = await Promise.all(conversations.map((c) => repo.listMessages(c.id)))
      const messages: Record<string, Message[]> = {}
      conversations.forEach((c, i) => {
        messages[c.id] = lists[i]
      })
      set((s) => ({ messages: { ...s.messages, ...messages } }))
    },

    select(id) {
      set({ activeId: id })
      // 切换会话时退出消息多选模式（选择状态绑定单一会话）
      const sel = useUIStore.getState().selection
      if (sel && sel.convId !== id) useUIStore.getState().stopSelection()
      if (id) void get().ensureMessages(id)
    },

    async ensureMessages(convId) {
      if (get().messages[convId]) return
      const list = await repo.listMessages(convId)
      set((s) => ({ messages: { ...s.messages, [convId]: list } }))
    },

    async createPrivate(personaId) {
      const existing = get().conversations.find(
        (c) => c.type === 'private' && c.personaIds[0] === personaId,
      )
      if (existing) {
        get().select(existing.id)
        return
      }
      const persona = usePersonaStore.getState().personas.find((p) => p.id === personaId)
      const conv: Conversation = {
        id: uid(),
        type: 'private',
        title: persona?.name ?? '对话',
        personaIds: [personaId],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await repo.putConversation(conv)
      set((s) => ({
        conversations: [conv, ...s.conversations],
        messages: { ...s.messages, [conv.id]: [] },
      }))
      get().select(conv.id)
    },

    async createAssistant() {
      const existing = get().conversations.find((c) => c.type === 'assistant')
      if (existing) {
        get().select(existing.id)
        return existing.id
      }
      const conv: Conversation = {
        id: uid(),
        type: 'assistant',
        title: 'AI 助手',
        personaIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await repo.putConversation(conv)
      set((s) => ({
        conversations: [conv, ...s.conversations],
        messages: { ...s.messages, [conv.id]: [] },
      }))
      get().select(conv.id)
      return conv.id
    },

    async createGroup(title, personaIds, hostPersonaId) {
      const conv: Conversation = {
        id: uid(),
        type: 'group',
        title,
        personaIds,
        hostPersonaId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await repo.putConversation(conv)
      set((s) => ({
        conversations: [conv, ...s.conversations],
        messages: { ...s.messages, [conv.id]: [] },
      }))
      get().select(conv.id)
    },

    async updateGroup(convId, patch) {
      const conv = get().conversations.find((c) => c.id === convId)
      if (!conv) return
      const next = { ...conv, ...patch, updatedAt: Date.now() }
      await repo.putConversation(next)
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? next : c)) }))
    },

    async removeConversation(id) {
      await repo.deleteConversation(id)
      set((s) => {
        const messages = { ...s.messages }
        delete messages[id]
        return {
          conversations: s.conversations.filter((c) => c.id !== id),
          messages,
          activeId: s.activeId === id ? null : s.activeId,
        }
      })
    },

    async patchConversationFlags(id, patch) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      const next = { ...conv, ...patch }
      await repo.putConversation(next)
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? next : c)) }))
    },

    async sendUserMessage(convId, text, attachments) {
      const conv = get().conversations.find((c) => c.id === convId)
      if (!conv || get().gen.active) return
      if (!text && !attachments?.length) return
      appendMessage({
        id: uid(),
        conversationId: convId,
        role: 'user',
        content: text,
        createdAt: Date.now(),
        status: 'done',
      })
      touchConversation(convId)
      let targets: (string | null)[] = []
      if (conv.type === 'assistant') {
        targets = [null]
      } else if (conv.type === 'private') {
        targets = [conv.personaIds[0]]
      } else {
        const members = usePersonaStore
          .getState()
          .personas.filter((p) => conv.personaIds.includes(p.id))
        const mentioned = parseMentions(
          text,
          members.map((m) => ({ id: m.id, name: m.name })),
        )
        targets = mentioned.length ? mentioned : conv.hostPersonaId ? [conv.hostPersonaId] : []
      }
      if (targets.length) void runQueue(convId, targets, 'direct')
    },

    startRound(convId, rounds) {
      const conv = get().conversations.find((c) => c.id === convId)
      if (!conv || conv.type !== 'group' || get().gen.active) return
      const queue = expandRoundQueue(conv.personaIds, rounds)
      void runQueue(convId, queue, 'round')
    },

    stopGeneration() {
      abortRef?.abort()
      set((s) => ({ gen: { ...s.gen, queue: [] } }))
    },

    async retryMessage(convId, msgId) {
      if (get().gen.active) return
      const list = get().messages[convId] ?? []
      const msg = list.find((m) => m.id === msgId)
      if (!msg || msg.role !== 'assistant') return
      // assistant 会话的消息没有 senderPersonaId，用 null 表示直连默认模型
      const personaId: string | null | undefined = msg.senderPersonaId
        ?? (get().conversations.find((c) => c.id === convId)?.type === 'assistant' ? null : undefined)
      if (personaId === undefined) return
      set((s) => ({
        messages: { ...s.messages, [convId]: list.filter((m) => m.id !== msgId) },
      }))
      await repo.deleteMessage(msgId)
      void runQueue(convId, [personaId], 'direct')
    },

    async deleteMessage(convId, msgId) {
      set((s) => ({
        messages: {
          ...s.messages,
          [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== msgId),
        },
      }))
      await repo.deleteMessage(msgId)
    },
  }
})
