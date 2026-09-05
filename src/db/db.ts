import Dexie, { type Table } from 'dexie'
import type { Conversation, Favorite, Message, Persona, Provider, Settings } from '../types'
import { PRESET_PERSONAS } from './presets'

class MindVerseDB extends Dexie {
  personas!: Table<Persona, string>
  conversations!: Table<Conversation, string>
  messages!: Table<Message, string>
  providers!: Table<Provider, string>
  settings!: Table<Settings, string>
  favorites!: Table<Favorite, string>

  constructor() {
    super('MindVerseDB')
    this.version(1).stores({
      personas: 'id, updatedAt',
      conversations: 'id, updatedAt',
      messages: 'id, conversationId, createdAt, [conversationId+createdAt]',
      providers: 'id',
      settings: 'id',
    })
    this.version(2).stores({
      favorites: 'id, createdAt',
    })
  }
}

export const db = new MindVerseDB()

/** 确保预设人格存在（新增预设时自动补齐） */
export async function ensurePresets() {
  const count = await db.personas.where('id').startsWith('preset-').count()
  if (count < PRESET_PERSONAS.length) {
    await db.personas.bulkPut(PRESET_PERSONAS)
  }
}

/** 备份文件结构 */
export interface BackupPayload {
  app: 'MindVerse'
  version: 1
  exportedAt: number
  data: {
    personas: Persona[]
    conversations: Conversation[]
    messages: Message[]
    providers: Provider[]
    settings: Settings[]
    favorites: Favorite[]
  }
}

/** 全量导出（含 API Key，导出文件注意保管） */
export async function exportAllData(): Promise<BackupPayload> {
  const [personas, conversations, messages, providers, settings, favorites] = await Promise.all([
    db.personas.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.providers.toArray(),
    db.settings.toArray(),
    db.favorites.toArray(),
  ])
  return { app: 'MindVerse', version: 1, exportedAt: Date.now(), data: { personas, conversations, messages, providers, settings, favorites } }
}

/** 覆盖式导入：清空全部表后写入备份内容（调用方需先弹窗确认） */
export async function importAllData(raw: unknown): Promise<void> {
  const obj = raw as Partial<BackupPayload>
  if (!obj || obj.app !== 'MindVerse' || !obj.data || typeof obj.data !== 'object') {
    throw new Error('不是有效的 MindVerse 备份文件')
  }
  const d = obj.data
  await db.transaction(
    'rw',
    [db.personas, db.conversations, db.messages, db.providers, db.settings, db.favorites],
    async () => {
      await Promise.all([
        db.personas.clear(),
        db.conversations.clear(),
        db.messages.clear(),
        db.providers.clear(),
        db.settings.clear(),
        db.favorites.clear(),
      ])
      if (Array.isArray(d.personas)) await db.personas.bulkPut(d.personas)
      if (Array.isArray(d.conversations)) await db.conversations.bulkPut(d.conversations)
      if (Array.isArray(d.messages)) await db.messages.bulkPut(d.messages)
      if (Array.isArray(d.providers)) await db.providers.bulkPut(d.providers)
      if (Array.isArray(d.settings)) await db.settings.bulkPut(d.settings)
      if (Array.isArray(d.favorites)) await db.favorites.bulkPut(d.favorites)
    },
  )
}
