/**
 * 数据仓库（local-first，类微信体验）：
 * - 本地 Dexie 永远是第一数据源（离线可看、秒开）
 * - 登录后：写操作双写（本地 + 服务器），读操作双读合并（本地 + 服务器增量，updatedAt 新者胜）
 * - 未登录：纯本地，与一期行为完全一致
 * stores 一律通过本模块持久化，禁止直连 db。
 */
import type { Conversation, Favorite, Message, Persona, Provider, Settings } from '../types'
import { db, ensurePresets } from '../db/db'
import { useAuthStore } from '../stores/authStore'
import { api } from './api'
import { toast } from '../stores/toastStore'
import { logger } from '../utils/logger'

const serverMode = () => useAuthStore.getState().loggedIn

/** 服务器连接失败只提示一次（避免每次读都弹） */
let serverDownNotified = false
function notifyServerDown(err: unknown) {
  logger.error('server sync failed:', err)
  if (!serverDownNotified) {
    serverDownNotified = true
    toast.error('服务器连接失败，当前展示本地数据')
  }
}

/** 登录态下写服务器；失败 Toast（不静默），本地数据不受影响 */
async function serverWrite(fn: () => Promise<unknown>) {
  if (!serverMode()) return
  try {
    await fn()
  } catch (err) {
    toast.error(`同步到服务器失败：${err instanceof Error ? err.message : '未知错误'}`)
  }
}

/** 按 id 合并两组数据，timeField 新者胜 */
function mergeById<T extends { id: string }>(local: T[], remote: T[], timeField: keyof T): T[] {
  const map = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const prev = map.get(item.id)
    if (!prev || (item[timeField] as number) > (prev[timeField] as number)) {
      map.set(item.id, item)
    }
  }
  return [...map.values()]
}

// ---------- personas ----------

export async function listPersonas(): Promise<Persona[]> {
  if (!serverMode()) {
    await ensurePresets()
    const personas = await db.personas.toArray()
    return personas.sort((a, b) => a.updatedAt - b.updatedAt)
  }
  await ensurePresets()
  const [local, remote] = await Promise.all([
    db.personas.toArray(),
    api.get<Persona[]>('/api/personas').catch((e) => {
      notifyServerDown(e)
      return null
    }),
  ])
  if (!remote) return local.sort((a, b) => a.updatedAt - b.updatedAt)
  const merged = mergeById(local, remote, 'updatedAt')
  await db.personas.bulkPut(merged).catch(() => null) // 回写本地缓存，失败不阻塞
  return merged.sort((a, b) => a.updatedAt - b.updatedAt)
}

export async function putPersona(p: Persona): Promise<void> {
  await db.personas.put(p)
  await serverWrite(() => api.post('/api/personas', p))
}

export async function deletePersona(id: string): Promise<void> {
  await db.personas.delete(id)
  await serverWrite(() => api.delete(`/api/personas/${id}`))
}

// ---------- conversations ----------

export async function listConversations(): Promise<Conversation[]> {
  if (!serverMode()) {
    const list = await db.conversations.toArray()
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  const [local, remote] = await Promise.all([
    db.conversations.toArray(),
    api.get<Conversation[]>('/api/conversations').catch((e) => {
      notifyServerDown(e)
      return null
    }),
  ])
  if (!remote) return local.sort((a, b) => b.updatedAt - a.updatedAt)
  const merged = mergeById(local, remote, 'updatedAt')
  await db.conversations.bulkPut(merged).catch(() => null)
  return merged.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function putConversation(c: Conversation): Promise<void> {
  await db.conversations.put(c)
  await serverWrite(() => api.post('/api/conversations', c))
}

export async function deleteConversation(id: string): Promise<void> {
  await db.messages.where('conversationId').equals(id).delete()
  await db.conversations.delete(id)
  await serverWrite(() => api.delete(`/api/conversations/${id}`))
}

// ---------- messages ----------

export async function listMessages(convId: string): Promise<Message[]> {
  const local = await db.messages.where('conversationId').equals(convId).sortBy('createdAt')
  if (!serverMode()) return local
  const remote = await api
    .get<Message[]>(`/api/conversations/${convId}/messages?limit=1000`)
    .catch((e) => {
      notifyServerDown(e)
      return null
    })
  if (!remote) return local
  // 合并：服务器版本覆盖同 id 本地（本地正在流式生成的除外）；本地独有（离线写的）保留
  const remoteIds = new Set(remote.map((m) => m.id))
  const merged = [
    ...remote,
    ...local.filter(
      (m) => !remoteIds.has(m.id) || m.status === 'streaming',
    ),
  ].sort((a, b) => a.createdAt - b.createdAt)
  await db.messages.bulkPut(merged.filter((m) => m.status !== 'streaming')).catch(() => null)
  return merged
}

export async function putMessage(m: Message): Promise<void> {
  if (m.status === 'streaming') {
    // 流式占位/中间态只写本地，完成后由 done 状态触发全量提交
    await db.messages.put(m)
    return
  }
  await db.messages.put(m)
  await serverWrite(() => api.post('/api/messages', m))
}

export async function patchMessage(id: string, patch: Partial<Message>): Promise<void> {
  await db.messages.update(id, patch)
  // 服务器 upsert 需要整条消息——由调用方随后走 putMessage 提交完整对象
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id)
  await serverWrite(() => api.delete(`/api/messages/${id}`))
}

// ---------- providers（服务器响应不含 apiKey；合并时保留本地已有 Key，避免退出登录后丢失）----------

export async function listProviders(): Promise<Provider[]> {
  const local = await db.providers.toArray()
  if (!serverMode()) return local
  const remote = await api
    .get<Partial<Provider>[]>('/api/providers')
    .catch((e) => {
      notifyServerDown(e)
      return null
    })
  if (!remote) return local
  // 服务器版本无 apiKey 字段：用本地同 id 的 Key 补上
  const merged = mergeById(local, remote as Provider[], 'id').map((p) => ({
    ...p,
    apiKey: (p as Provider).apiKey || local.find((l) => l.id === p.id)?.apiKey || '',
  })) as Provider[]
  await db.providers.bulkPut(merged).catch(() => null)
  return merged
}

export async function putProvider(p: Provider): Promise<void> {
  await db.providers.put(p)
  await serverWrite(() => api.post('/api/providers', p))
}

export async function deleteProvider(id: string): Promise<void> {
  await db.providers.delete(id)
  await serverWrite(() => api.delete(`/api/providers/${id}`))
}

// ---------- settings（登录时以服务器为准；服务器无配置则上传本地，完成首次迁移）----------

export async function getSettings(): Promise<Settings | null> {
  const local = (await db.settings.get('global')) ?? null
  if (!serverMode()) return local
  let remote: Settings | null = null
  try {
    remote = await api.get<Settings>('/api/settings')
  } catch (e) {
    notifyServerDown(e)
    return local
  }
  if (!remote?.activeProviderId && local?.activeProviderId) {
    // 首次登录：把本地默认模型上传
    await api
      .put('/api/settings', {
        activeProviderId: local.activeProviderId,
        activeModel: local.activeModel,
        defaultRounds: local.defaultRounds,
      })
      .catch(() => null)
    return local
  }
  if (remote) await db.settings.put(remote).catch(() => null)
  return remote ?? local
}

export async function putSettings(s: Settings): Promise<void> {
  await db.settings.put(s)
  if (!serverMode()) return
  await api
    .put('/api/settings', {
      activeProviderId: s.activeProviderId,
      activeModel: s.activeModel,
      defaultRounds: s.defaultRounds,
    })
    .catch((e) => {
      toast.error(`设置同步失败：${e instanceof Error ? e.message : '未知错误'}`)
    })
}

// ---------- favorites（消息收藏，快照式：不依赖原消息/会话存活）----------

export async function listFavorites(): Promise<Favorite[]> {
  const local = await db.favorites.toArray()
  if (!serverMode()) return local.sort((a, b) => b.createdAt - a.createdAt)
  const remote = await api
    .get<Favorite[]>('/api/favorites')
    .catch((e) => {
      notifyServerDown(e)
      return null
    })
  if (!remote) return local.sort((a, b) => b.createdAt - a.createdAt)
  const merged = mergeById(local, remote, 'createdAt')
  await db.favorites.bulkPut(merged).catch(() => null)
  return merged.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putFavorite(f: Favorite): Promise<void> {
  await db.favorites.put(f)
  await serverWrite(() => api.post('/api/favorites', f))
}

export async function deleteFavorite(id: string): Promise<void> {
  await db.favorites.delete(id)
  await serverWrite(() => api.delete(`/api/favorites/${id}`))
}

// ---------- 全量同步（登录后调用：本地 → 服务器上行）----------

/** 把本地全部数据 upsert 到服务器（服务端 updatedAt 保护，旧不覆盖新）；读合并由各 list 函数完成 */
export async function syncAll(): Promise<void> {
  if (!serverMode()) return
  const [personas, conversations, messages, providers, settings, favorites] = await Promise.all([
    db.personas.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.providers.toArray(),
    db.settings.get('global'),
    db.favorites.toArray(),
  ])

  const tasks: Promise<unknown>[] = [
    ...personas.map((p) => api.post('/api/personas', p).catch(() => null)),
    ...conversations.map((c) => api.post('/api/conversations', c).catch(() => null)),
    ...messages
      .filter((m) => m.status !== 'streaming')
      .map((m) => api.post('/api/messages', m).catch(() => null)),
    ...providers.map((p) => api.post('/api/providers', p).catch(() => null)),
    ...favorites.map((f) => api.post('/api/favorites', f).catch(() => null)),
  ]
  if (settings?.activeProviderId) {
    tasks.push(
      api
        .put('/api/settings', {
          activeProviderId: settings.activeProviderId,
          activeModel: settings.activeModel,
          defaultRounds: settings.defaultRounds,
        })
        .catch(() => null),
    )
  }
  await Promise.all(tasks)
}
