import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { usePersonaStore } from '../stores/personaStore'
import { useUIStore } from '../stores/uiStore'
import Avatar from './common/Avatar'
import Dialog from './common/Dialog'

const inputCls =
  'w-full border border-mv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-mv-accent bg-mv-panel text-mv-ink transition-colors'

export default function ConversationSetup() {
  const target = useUIStore((s) => s.conversationSetup)
  const close = useUIStore((s) => s.closeConversationSetup)
  const personas = usePersonaStore((s) => s.personas)
  const conversations = useChatStore((s) => s.conversations)
  const createPrivate = useChatStore((s) => s.createPrivate)
  const createGroup = useChatStore((s) => s.createGroup)
  const updateGroup = useChatStore((s) => s.updateGroup)

  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [hostId, setHostId] = useState('')

  useEffect(() => {
    if (!target) return
    const conv = target.convId ? conversations.find((c) => c.id === target.convId) : undefined
    setSelected(conv?.personaIds ?? [])
    setTitle(conv?.title ?? '')
    setHostId(conv?.hostPersonaId ?? '')
  }, [target, conversations])

  if (!target) return null
  const mode = target.mode
  const conv = target.convId ? conversations.find((c) => c.id === target.convId) : undefined
  const members = personas.filter((p) => selected.includes(p.id))
  const autoTitle =
    members.length >= 2
      ? `${members.slice(0, 2).map((m) => m.name).join('、')} 和我的群`
      : '新的群聊'

  const isPrivate = mode === 'private'
  const canSubmit = isPrivate ? selected.length === 1 : selected.length >= 2

  const toggle = (id: string) => {
    if (isPrivate) {
      setSelected([id])
    } else {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
      setHostId((h) => (members.some((m) => m.id === id) && h === id ? '' : h))
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    if (isPrivate) {
      await createPrivate(selected[0])
    } else if (mode === 'group') {
      await createGroup(title.trim() || autoTitle, selected, hostId || selected[0])
    } else if (conv) {
      await updateGroup(conv.id, {
        title: title.trim() || autoTitle,
        personaIds: selected,
        hostPersonaId: hostId || selected[0],
      })
    }
    close()
  }

  return (
    <Dialog
      title={isPrivate ? '发起私聊' : mode === 'group' ? '发起群聊' : '管理群聊'}
      onClose={close}
      width={520}
    >
      <div className="p-5 flex flex-col gap-3.5">
        {!isPrivate && (
          <>
            <div>
              <label className="text-xs text-mv-ink-4 block mb-1">群名称</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={autoTitle}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-mv-ink-4 block mb-1">
                默认主持人格（群里没人被 @ 时由 TA 回应）
              </label>
              <select
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                disabled={!members.length}
                className={inputCls}
              >
                <option value="">（群内第一位成员）</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="text-xs text-mv-ink-4 block mb-1">
            选择成员{isPrivate ? '（选 1 位）' : '（至少 2 位）'}
          </label>
          <div className="border border-mv-border rounded-xl max-h-64 overflow-y-auto divide-y divide-mv-hover">
            {personas.map((p) => {
              const on = selected.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left ${
                    on ? 'bg-mv-accent-soft' : 'hover:bg-mv-hover/60'
                  }`}
                >
                  <Avatar persona={p} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-mv-ink truncate">{p.name}</div>
                    {p.tagline && <div className="text-xs text-mv-ink-4 truncate">{p.tagline}</div>}
                  </div>
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      on ? 'bg-mv-link border-mv-link text-white' : 'border-mv-border'
                    }`}
                  >
                    {on && <Check size={12} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={close} className="px-4 py-1.5 rounded-lg text-sm text-mv-ink-4 hover:bg-mv-hover">
            取消
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className={`px-4 py-1.5 rounded-lg text-sm text-white bg-mv-link ${
              canSubmit ? 'hover:opacity-90' : 'opacity-30 cursor-not-allowed'
            }`}
          >
            {isPrivate ? '开始对话' : mode === 'group' ? '创建群聊' : '保存'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
