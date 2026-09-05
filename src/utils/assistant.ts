import type { Persona } from '../types'

/** 「AI 助手」展示用虚拟人格：assistant 会话没有真实人格，仅用于头像 / 名称展示 */
export const ASSISTANT_PERSONA: Persona = {
  id: '__assistant__',
  name: 'AI 助手',
  color: 'var(--mv-accent)',
  traits: [],
  systemPrompt: '',
  isPreset: true,
  createdAt: 0,
  updatedAt: 0,
}
