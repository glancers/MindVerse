import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Brain, CheckSquare, ChevronDown, Copy, FileText, Square, Star, Trash2 } from 'lucide-react'
import type { Conversation, Message, MessageAttachment, Persona } from '../types'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { confirmDialog } from '../stores/confirmStore'
import { toast } from '../stores/toastStore'
import { favoritable, snapshotItem, useFavoriteStore } from '../stores/favoriteStore'
import { formatSize } from '../utils/files'
import Avatar from './common/Avatar'
import Markdown from './common/Markdown'

/** 图片全屏预览：统一遮罩，点击任意处关闭 */
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
      onClick={onClose}
    >
      <img src={src} alt="预览" className="max-w-full max-h-full object-contain rounded-lg" />
    </div>,
    document.body,
  )
}

/** 消息附件展示：图片（可点开预览）+ 文件卡片 */
function Attachments({ list }: { list: MessageAttachment[] }) {
  const [preview, setPreview] = useState<string | null>(null)
  const images = list.filter((a) => a.kind === 'image' && a.dataUrl)
  const files = list.filter((a) => a.kind !== 'image')
  return (
    <>
      {!!images.length && (
        <div className={`flex flex-wrap gap-1.5 ${files.length ? 'mb-1.5' : ''}`}>
          {images.map((a, i) => (
            <img
              key={i}
              src={a.dataUrl}
              alt={a.name}
              onClick={() => setPreview(a.dataUrl!)}
              className="w-32 h-32 rounded-lg object-cover border border-black/10 cursor-zoom-in hover:opacity-90 transition-opacity"
            />
          ))}
        </div>
      )}
      {files.map((a, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-lg border border-black/10 bg-white/40 px-3 py-2 mb-1.5 max-w-64"
        >
          <FileText size={20} className="shrink-0 opacity-70" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{a.name}</div>
            <div className="text-[11px] opacity-60">{formatSize(a.size)}</div>
          </div>
        </div>
      ))}
      {preview && <ImageViewer src={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 群聊消息里高亮 @成员名（用其主题色） */
function renderWithMentions(text: string, members: Persona[]) {
  const names = members.map((m) => m.name).filter(Boolean)
  if (!names.length || !text.includes('@')) return text
  const re = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g')
  const parts = text.split(re)
  return parts.map((part, i) => {
    if (part.startsWith('@') && names.includes(part.slice(1))) {
      const p = members.find((m) => m.name === part.slice(1))
      return (
        <span key={i} className="font-semibold" style={{ color: p?.color ?? '#4F6EF7' }}>
          {part}
        </span>
      )
    }
    return part
  })
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-mv-ink-4 hover:text-mv-ink p-1 rounded-md hover:bg-mv-hover"
    >
      {children}
    </button>
  )
}

/** 用户自己的头像（微信：每条消息两侧都有头像） */
function SelfAvatar() {
  return (
    <div className="w-10 h-10 rounded-[5px] bg-mv-self flex items-center justify-center text-white text-[17px] font-medium shrink-0 select-none">
      我
    </div>
  )
}

/** 思考型模型的推理过程：可折叠块（流式中或无正文时默认展开） */
function ThinkingBlock({ text, streaming, hasContent }: { text: string; streaming: boolean; hasContent: boolean }) {
  const [open, setOpen] = useState(streaming || !hasContent)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] text-mv-ink-4 hover:text-mv-ink select-none"
      >
        <Brain size={13} />
        <span className={streaming ? 'animate-pulse' : ''}>{streaming ? '思考中…' : '思考过程'}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 pl-2.5 border-l-2 border-mv-border text-[13px] leading-5 text-mv-ink-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
}

interface Props {
  message: Message
  persona?: Persona
  isGroup: boolean
  members: Persona[]
  conv: Conversation
}

export default function MessageBubble({ message, persona, isGroup, members, conv }: Props) {
  const retryMessage = useChatStore((s) => s.retryMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)
  const selection = useUIStore((s) => s.selection)
  const startSelection = useUIStore((s) => s.startSelection)
  const toggleSelected = useUIStore((s) => s.toggleSelected)
  const addFavorite = useFavoriteStore((s) => s.add)

  const selecting = selection?.convId === conv.id
  const selected = selecting && selection.ids.includes(message.id)
  const canFav = favoritable(message)
  const senderName = message.role === 'user' ? '我' : persona?.name ?? '未知'

  const doFavorite = async () => {
    await addFavorite([snapshotItem(message, senderName)], conv)
  }
  const doSelectOne = () => startSelection(conv.id)

  const doCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    toast.success('已经复制到粘贴板')
  }
  const doRetry = async () => {
    const ok = await confirmDialog({
      title: '重新生成',
      message: '将删除这条回复并重新生成，确定吗？',
      confirmText: '重新生成',
    })
    if (ok) void retryMessage(message.conversationId, message.id)
  }
  const doDelete = async () => {
    const ok = await confirmDialog({
      title: '删除消息',
      message: '确定删除这条消息吗？',
      danger: true,
      confirmText: '删除',
    })
    if (ok) void deleteMessage(message.conversationId, message.id)
  }

  const bubbleStyle = { maxWidth: 'min(72%, 560px)' }

  // 多选模式：整条可点切换勾选，隐藏 hover 操作
  if (selecting) {
    const SelectIcon = selected ? CheckSquare : Square
    return (
      <button
        onClick={() => (canFav ? toggleSelected(message.id) : undefined)}
        className={`msg-enter flex items-start gap-2.5 w-full text-left px-1 py-0.5 rounded-lg transition-colors ${
          selected ? 'bg-mv-accent-soft' : 'hover:bg-mv-hover/60'
        } ${canFav ? '' : 'opacity-40 cursor-not-allowed'}`}
      >
        <span className="w-10 shrink-0 flex justify-center pt-2">
          <SelectIcon
            size={20}
            strokeWidth={1.8}
            className={selected ? 'text-mv-accent' : 'text-mv-ink-4'}
          />
        </span>
        <span className="flex flex-col gap-1 min-w-0" style={bubbleStyle}>
          {isGroup && message.role === 'assistant' && persona && (
            <span className="text-xs text-mv-ink-4 px-0.5">{persona.name}</span>
          )}
          <span
            className={`rounded-lg px-3.5 py-2 text-[15px] leading-[23px] whitespace-pre-wrap break-words ${
              message.role === 'user'
                ? 'bg-mv-bubble-me text-mv-bubble-me-ink'
                : 'bg-mv-bubble-other text-mv-bubble-other-ink'
            }`}
          >
            {message.content}
          </span>
        </span>
      </button>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="msg-enter flex justify-end items-start gap-2.5 group">
        <div className="flex flex-col items-end gap-1" style={bubbleStyle}>
          <div className="bubble-me bg-mv-bubble-me text-mv-bubble-me-ink rounded-lg px-3.5 py-2 text-[15px] leading-[23px] whitespace-pre-wrap break-words">
            {!!message.attachments?.length && <Attachments list={message.attachments} />}
            {isGroup ? renderWithMentions(message.content, members) : message.content}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canFav && (
              <IconBtn onClick={() => void doFavorite()} label="收藏">
                <Star size={14} />
              </IconBtn>
            )}
            <IconBtn onClick={doSelectOne} label="多选">
              <CheckSquare size={14} />
            </IconBtn>
            <IconBtn onClick={doCopy} label="复制">
              <Copy size={14} />
            </IconBtn>
            <IconBtn onClick={doDelete} label="删除">
              <Trash2 size={14} />
            </IconBtn>
          </div>
        </div>
        <SelfAvatar />
      </div>
    )
  }

  // 空消息防御：完成/停止态且无正文、无思考、无附件的 AI 消息不渲染（错误态保留重试入口）
  if (
    !message.content.trim() &&
    !message.thinking &&
    !message.attachments?.length &&
    (message.status === 'done' || message.status === 'stopped')
  ) {
    return null
  }

  return (
    <div className="msg-enter flex items-start gap-2.5 group">
      <Avatar persona={persona} size={40} />
      <div className="flex flex-col gap-1" style={bubbleStyle}>
        {isGroup && persona && <span className="text-xs text-mv-ink-4 px-0.5">{persona.name}</span>}
        <div
          className={`bubble-other bg-mv-bubble-other text-mv-bubble-other-ink rounded-lg px-3.5 py-2 text-[15px] leading-[23px] break-words ${
            message.status === 'error' ? 'ring-1 ring-mv-danger' : ''
          }`}
        >
          {message.status === 'streaming' && !message.content && !message.thinking ? (
            /* 首 token 前的等待态：三点打字动画，替代空气泡+光标 */
            <div className="flex items-center gap-1 py-1" aria-label="正在输入">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:300ms]" />
            </div>
          ) : (
            <>
              {!!message.thinking && (
                <ThinkingBlock
                  text={message.thinking}
                  streaming={message.status === 'streaming'}
                  hasContent={!!message.content}
                />
              )}
              <Markdown content={message.content} />
              {message.status === 'streaming' && <span className="animate-pulse">▍</span>}
            </>
          )}
          {message.status === 'error' && (
            <div className="mt-1.5">
              <button onClick={doRetry} className="text-[13px] text-mv-danger hover:underline">
                重试
              </button>
            </div>
          )}
        </div>
        {message.status === 'done' && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canFav && (
              <IconBtn onClick={() => void doFavorite()} label="收藏">
                <Star size={14} />
              </IconBtn>
            )}
            <IconBtn onClick={doSelectOne} label="多选">
              <CheckSquare size={14} />
            </IconBtn>
            <IconBtn onClick={doCopy} label="复制">
              <Copy size={14} />
            </IconBtn>
          </div>
        )}
      </div>
    </div>
  )
}
