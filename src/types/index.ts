export interface ModelBinding {
  providerId: string
  model: string
}

export interface Persona {
  id: string
  name: string
  avatar?: string
  color: string
  tagline?: string
  /** 分组名（可选）：通讯录里按组折叠展示，空 = 不分组 */
  group?: string
  traits: string[]
  systemPrompt: string
  modelBinding?: ModelBinding
  isPreset: boolean
  createdAt: number
  updatedAt: number
}

export type ProviderType = 'ark' | 'openai' | 'anthropic' | 'custom'

export interface Provider {
  id: string
  type: ProviderType
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  defaultModel: string
}

export interface Conversation {
  id: string
  /** assistant = 无人格、直连全局默认模型的「AI 助手」会话 */
  type: 'private' | 'group' | 'assistant'
  title: string
  personaIds: string[]
  hostPersonaId?: string
  pinned?: boolean
  folded?: boolean
  createdAt: number
  updatedAt: number
}

export type MessageStatus = 'done' | 'streaming' | 'error' | 'stopped'

/** 消息附件：图片（dataURL，模型可见）/ 文本文件（内容拼给模型）/ 其他（仅展示文件名） */
export interface MessageAttachment {
  name: string
  mime: string
  size: number
  kind: 'image' | 'text' | 'file'
  /** 图片的 dataURL（data:image/...;base64,...） */
  dataUrl?: string
  /** 文本文件内容（限制大小内读取） */
  text?: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  senderPersonaId?: string
  content: string
  attachments?: MessageAttachment[]
  /** 思考型模型的推理过程（reasoning_content），非思考模型为空 */
  thinking?: string
  createdAt: number
  status: MessageStatus
}

export interface Settings {
  id: string
  activeProviderId: string
  activeModel: string
  defaultRounds: number
}

/** 收藏的消息快照（不依赖原消息/人格/会话存活） */
export interface FavoriteItem {
  messageId: string
  role: 'user' | 'assistant'
  senderPersonaId?: string
  senderName: string // '我' 或人格名（收藏时快照）
  content: string
  createdAt: number
}

/** 一条收藏 = 单条或多条消息，记录来源会话 */
export interface Favorite {
  id: string
  items: FavoriteItem[]
  conversationId: string
  conversationTitle: string // 来源快照，会话删除后仍可显示
  createdAt: number
  lastUsedAt?: number // 最近使用（查看/跳转来源时更新），0/缺省 = 未用过
}
