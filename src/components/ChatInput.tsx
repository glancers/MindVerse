import { useRef, useState } from 'react'
import { File, FileText, Minus, MoreHorizontal, Scissors, Send, Smile, Square, MessagesSquare, Plus, X } from 'lucide-react'
import type { Conversation, MessageAttachment, Persona } from '../types'
import { useChatStore } from '../stores/chatStore'
import { usePersonaStore } from '../stores/personaStore'
import { useSettingsStore } from '../stores/settingsStore'
import { toast } from '../stores/toastStore'
import { formatSize, readAttachment, MAX_ATTACHMENTS } from '../utils/files'
import Avatar from './common/Avatar'

interface MentionState {
  open: boolean
  start: number
  end: number
  query: string
}

const CLOSED_MENTION: MentionState = { open: false, start: 0, end: 0, query: '' }

/** 内置颜文字（微信表情位的轻量替代，纯文本可随时发给 AI） */
const EMOTICONS = [
  '(⌒▽⌒)',
  '(´∀｀)',
  '(＾▽＾)',
  '(￣▽￣)',
  'Σ(ﾟдﾟ;)',
  '(╯°□°）╯',
  '(T_T)',
  '(￣_￣)',
  '(￢_￢)',
  'ヽ(✿ﾟ▽ﾟ)ノ',
]

export default function ChatInput({ conv, members }: { conv: Conversation; members: Persona[] }) {
  const gen = useChatStore((s) => s.gen)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const startRound = useChatStore((s) => s.startRound)
  const stopGeneration = useChatStore((s) => s.stopGeneration)
  const defaultRounds = useSettingsStore((s) => s.defaultRounds)
  const setDefaultRounds = useSettingsStore((s) => s.setDefaultRounds)

  const [value, setValue] = useState('')
  const [mention, setMention] = useState<MentionState>(CLOSED_MENTION)
  const [emoticonOpen, setEmoticonOpen] = useState(false)
  const [rounds, setRounds] = useState(defaultRounds)
  const [pending, setPending] = useState<MessageAttachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isGroup = conv.type === 'group'
  const canSend = (value.trim().length > 0 || pending.length > 0) && !gen.active

  /** 选择/粘贴的文件 → 附件（超限 toast，不中断其余文件） */
  const addFiles = async (files: FileList | File[]) => {
    const list = [...files]
    if (!list.length) return
    const next: MessageAttachment[] = []
    for (const f of list) {
      if (pending.length + next.length >= MAX_ATTACHMENTS) {
        toast.error(`每条消息最多 ${MAX_ATTACHMENTS} 个附件`)
        break
      }
      try {
        next.push(await readAttachment(f))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '文件读取失败')
      }
    }
    if (next.length) setPending((p) => [...p, ...next])
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      void addFiles(files)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setValue(v)
    const pos = e.target.selectionStart ?? v.length
    const m = /@([^@\n]*)$/.exec(v.slice(0, pos))
    if (m && isGroup) {
      setMention({ open: true, start: pos - m[0].length, end: pos, query: m[1] })
    } else {
      setMention(CLOSED_MENTION)
    }
  }

  /** 在光标处插入文本（颜文字 / @提及） */
  const insertText = (text: string) => {
    const ta = textareaRef.current
    if (!ta) {
      setValue(value + text)
      return
    }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? start
    const next = value.slice(0, start) + text + value.slice(end)
    setValue(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + text.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const selectMember = (p: Persona) => {
    const insert = `@${p.name} `
    const next = value.slice(0, mention.start) + insert + value.slice(mention.end)
    setValue(next)
    setMention(CLOSED_MENTION)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const pos = mention.start + insert.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const send = () => {
    if (!canSend) return
    const text = value.trim()
    const atts = pending
    setValue('')
    setPending([])
    setMention(CLOSED_MENTION)
    void sendUserMessage(conv.id, text, atts.length ? atts : undefined)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 通用约定：所有文本输入框支持 cmd/ctrl+A 全选
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      e.currentTarget.select()
      return
    }
    if (e.key === 'Escape') {
      setMention(CLOSED_MENTION)
      setEmoticonOpen(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const currentPersona = usePersonaStore((s) =>
    gen.currentPersonaId ? s.personas.find((p) => p.id === gen.currentPersonaId) : undefined,
  )
  const filteredMembers = mention.query
    ? members.filter((p) => p.name.includes(mention.query))
    : members

  const placeholder = gen.active
    ? gen.mode === 'round'
      ? '接龙进行中…'
      : '对方正在输入…'
    : ''

  return (
    <div className="border-t border-mv-border bg-mv-bg shrink-0">
      <div className="px-4 py-3">
        {isGroup && !gen.active && (
          <div className="flex items-center justify-between px-1 pb-2 h-8">
            <button
              onClick={() => startRound(conv.id, rounds)}
              className="text-xs text-mv-accent border border-mv-accent rounded-full px-3 py-0.5 hover:bg-mv-accent/10 transition-colors flex items-center gap-1"
            >
              <MessagesSquare size={12} />
              让大家聊聊
            </button>
            <div className="flex items-center gap-1.5 text-xs text-mv-ink-3">
              <span>轮数</span>
              <button
                aria-label="减少轮数"
                onClick={() => setRounds((r) => Math.max(1, r - 1))}
                className="w-5 h-5 rounded border border-mv-border flex items-center justify-center hover:bg-mv-panel"
              >
                <Minus size={10} />
              </button>
              <span className="w-4 text-center tabular-nums">{rounds}</span>
              <button
                aria-label="增加轮数"
                onClick={() => setRounds((r) => Math.min(10, r + 1))}
                className="w-5 h-5 rounded border border-mv-border flex items-center justify-center hover:bg-mv-panel"
              >
                <Plus size={10} />
              </button>
            </div>
          </div>
        )}
        {gen.active && (
          <div className="flex items-center justify-between px-1 pb-2 h-8">
            <span className="text-xs text-mv-ink-3 flex items-center gap-1.5 min-w-0">
              {currentPersona && <Avatar persona={currentPersona} size={16} />}
              <span className="truncate">
                {currentPersona?.name ?? (conv.type === 'assistant' ? 'AI 助手' : '成员')} 正在输入…
                {gen.mode === 'round' && `（${gen.done}/${gen.total}）`}
              </span>
            </span>
            <button
              onClick={stopGeneration}
              className="text-xs text-mv-danger border border-mv-danger rounded-full px-3 py-0.5 hover:bg-mv-danger/10 shrink-0 flex items-center gap-1"
            >
              <Square size={10} />
              {gen.mode === 'round' ? '停止接龙' : '停止生成'}
            </button>
          </div>
        )}

        {/* 输入区：文本区在上 → 底部一行（左侧工具栏 + 右侧发送） */}
        <div className="relative">
          {mention.open && filteredMembers.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 w-64 max-h-48 overflow-y-auto bg-mv-panel border border-mv-border rounded-lg shadow-lg py-1 z-10">
              {filteredMembers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectMember(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-mv-hover text-left"
                >
                  <Avatar persona={p} size={24} />
                  <span className="text-sm text-mv-ink">{p.name}</span>
                  {p.tagline && <span className="text-xs text-mv-ink-4 truncate">{p.tagline}</span>}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={gen.active}
            placeholder={placeholder}
            rows={3}
            className="w-full resize-none bg-transparent text-[15px] leading-[22px] outline-none placeholder:text-mv-ink-5 disabled:cursor-not-allowed px-1 py-1.5"
          />

          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 pt-1.5">
              {pending.map((a, i) => (
                <div key={i} className="relative group/att">
                  {a.kind === 'image' ? (
                    <img
                      src={a.dataUrl}
                      alt={a.name}
                      className="w-16 h-16 rounded-lg object-cover border border-mv-border"
                    />
                  ) : (
                    <div className="h-16 rounded-lg border border-mv-border bg-mv-panel px-3 flex items-center gap-2 max-w-44">
                      <FileText size={18} className="text-mv-ink-3 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-mv-ink truncate">{a.name}</div>
                        <div className="text-[10px] text-mv-ink-4">{formatSize(a.size)}</div>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    aria-label="移除附件"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-mv-panel border border-mv-border flex items-center justify-center text-mv-ink-4 hover:text-mv-ink shadow-sm"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 pb-0.5">
            <div className="flex items-center gap-0.5 h-9">
              <div className="relative">
                <button
                  onClick={() => setEmoticonOpen((v) => !v)}
                  aria-label="表情"
                  title="表情"
                  className={`w-8 h-8 flex items-center justify-center rounded ${
                    emoticonOpen ? 'text-mv-accent bg-mv-hover' : 'text-mv-ink-3 hover:bg-mv-hover'
                  }`}
                >
                  <Smile size={20} strokeWidth={1.5} />
                </button>
                {emoticonOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setEmoticonOpen(false)} />
                    <div className="absolute bottom-full mb-2 left-0 z-20 bg-mv-panel border border-mv-border rounded-lg shadow-lg p-2 w-64">
                      <div className="grid grid-cols-5 gap-1">
                        {EMOTICONS.map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              insertText(t)
                              setEmoticonOpen(false)
                            }}
                            className="h-9 rounded-md hover:bg-mv-hover text-[15px] text-mv-ink flex items-center justify-center"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                aria-label="截图"
                title="截图"
                className="w-8 h-8 flex items-center justify-center text-mv-ink-3 hover:bg-mv-hover rounded"
              >
                <Scissors size={20} strokeWidth={1.5} />
              </button>
              <button
                aria-label="文件"
                title="上传文件（图片 / 文本）"
                onClick={() => fileInputRef.current?.click()}
                disabled={gen.active}
                className="w-8 h-8 flex items-center justify-center text-mv-ink-3 hover:bg-mv-hover rounded disabled:opacity-40"
              >
                <File size={20} strokeWidth={1.5} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                aria-label="聊天记录"
                title="聊天记录"
                className="w-8 h-8 flex items-center justify-center text-mv-ink-3 hover:bg-mv-hover rounded"
              >
                <MoreHorizontal size={20} strokeWidth={1.5} />
              </button>
            </div>
            <button
              onClick={send}
              disabled={!canSend}
              aria-label="发送"
              className={`px-4 py-1 rounded-md text-sm transition-colors ${
                canSend
                  ? 'bg-mv-accent text-white hover:bg-mv-accent-hover'
                  : 'bg-mv-accent text-white opacity-30 cursor-not-allowed'
              }`}
            >
              发送(S)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
