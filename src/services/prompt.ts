import type { Conversation, Message, Persona } from '../types'
import type { LLMChatMessage, LLMContentPart } from './llm/client'
import { formatSize } from '../utils/files'

/** 附件 → 模型可见内容：图片走多模态 part，文本拼正文，其他仅附文件名 */
function messageContent(m: Message): LLMChatMessage['content'] {
  const atts = m.attachments?.length ? m.attachments : null
  if (!atts) return m.content
  const notes: string[] = []
  const images: string[] = []
  for (const a of atts) {
    if (a.kind === 'image' && a.dataUrl) images.push(a.dataUrl)
    else if (a.kind === 'text' && a.text !== undefined)
      notes.push(`[附件 ${a.name}]\n${a.text}\n[/附件]`)
    else notes.push(`[附件 ${a.name}（${formatSize(a.size)}，内容未读取）]`)
  }
  const text = [m.content, ...notes].filter(Boolean).join('\n\n')
  if (!images.length) return text
  return [
    { type: 'text', text: text || '（图片消息）' },
    ...images.map((url): LLMContentPart => ({ type: 'image_url', image_url: { url } })),
  ]
}

export function buildPrivateMessages(history: Message[]): LLMChatMessage[] {
  return history
    .filter((m) => m.status !== 'error')
    .map((m) => ({ role: m.role, content: messageContent(m) }))
}

export function buildGroupSystem(
  persona: Persona,
  conv: Conversation,
  members: Persona[],
  isRound: boolean,
): string {
  const memberLines = members
    .map((p) => `- ${p.name}：${p.tagline || ''}${p.traits.length ? `（${p.traits.join('、')}）` : ''}`)
    .join('\n')
  let sys =
    `${persona.systemPrompt}\n\n` +
    `你正在一个群聊「${conv.title}」中，成员有：\n${memberLines}\n\n` +
    `当前轮到你（${persona.name}）发言。请保持你的人设，直接输出内容，不要复述设定。`
  if (isRound) {
    sys +=
      '\n\n这是自动接龙环节，请围绕当前话题继续讨论，可以回应或反驳前面的观点，' +
      '发言控制在 3 句以内，自然收敛，不要生硬总结。'
  }
  return sys
}

export function buildGroupMessages(
  history: Message[],
  nameOf: (id: string) => string | undefined,
): LLMChatMessage[] {
  return history
    .filter((m) => m.status !== 'error')
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.role === 'assistant' && m.senderPersonaId
        ? { name: nameOf(m.senderPersonaId) ?? '成员' }
        : {}),
    }))
}
