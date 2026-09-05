import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageCircle, Pencil, Plus } from 'lucide-react'
import type { Persona } from '../types'
import { usePersonaStore } from '../stores/personaStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { isDesktopApp } from '../utils/desktop'
import Avatar from './common/Avatar'

function ContactItem({
  persona,
  active,
  onClick,
}: {
  persona: Persona
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-left ${
        active ? 'bg-mv-accent-soft' : 'hover:bg-mv-hover/60'
      }`}
    >
      <Avatar persona={persona} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-mv-ink truncate">{persona.name}</div>
        {persona.tagline && <div className="text-xs text-mv-ink-4 truncate mt-0.5">{persona.tagline}</div>}
      </div>
    </button>
  )
}

function DetailPane({ persona }: { persona: Persona }) {
  const openPersonaManager = useUIStore((s) => s.openPersonaManager)
  const setMainView = useUIStore((s) => s.setMainView)
  const createPrivate = useChatStore((s) => s.createPrivate)
  const providers = useSettingsStore((s) => s.providers)
  const binding = persona.modelBinding
  const boundProvider = binding ? providers.find((p) => p.id === binding.providerId) : undefined

  const startChat = async () => {
    await createPrivate(persona.id)
    setMainView('chat')
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      {/* 桌面端顶部拖拽条：与聊天 Header 同高对齐 */}
      {isDesktopApp && <div className="h-[54px] shrink-0" data-tauri-drag-region />}
      <div className="max-w-xl mx-auto px-8 py-10 flex flex-col items-center">
        <Avatar persona={persona} size={96} />
        <h2 className="text-xl font-semibold text-mv-ink mt-4 flex items-center gap-2">
          {persona.name}
          {persona.isPreset && (
            <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-mv-hover text-mv-ink-4">
              预设
            </span>
          )}
        </h2>
        {persona.tagline && <p className="text-sm text-mv-ink-4 mt-1">{persona.tagline}</p>}
        {!!persona.traits.length && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {persona.traits.map((t) => (
              <span
                key={t}
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: `${persona.color}1A`, color: persona.color }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2.5 mt-6">
          <button
            onClick={() => void startChat()}
            className="flex items-center gap-1.5 bg-mv-accent text-white text-sm px-5 py-2 rounded-xl hover:bg-mv-accent-hover transition-colors"
          >
            <MessageCircle size={15} />
            发消息
          </button>
          <button
            onClick={() => openPersonaManager(persona)}
            className="flex items-center gap-1.5 border border-mv-border text-mv-ink text-sm px-5 py-2 rounded-xl hover:bg-mv-hover transition-colors"
          >
            <Pencil size={14} />
            编辑
          </button>
        </div>
        <div className="w-full mt-8 border-t border-mv-border pt-5 flex flex-col gap-4">
          <div>
            <div className="text-xs text-mv-ink-4 mb-1.5">人格设定</div>
            <div className="text-sm text-mv-ink leading-6 bg-mv-panel border border-mv-border rounded-xl px-4 py-3 whitespace-pre-wrap">
              {persona.systemPrompt}
            </div>
          </div>
          <div>
            <div className="text-xs text-mv-ink-4 mb-1.5">模型</div>
            <div className="text-sm text-mv-ink">
              {binding && boundProvider
                ? `${boundProvider.name} / ${binding.model}（独立绑定）`
                : '跟随全局默认模型'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ContactsView() {
  const personas = usePersonaStore((s) => s.personas)
  const openPersonaManager = useUIStore((s) => s.openPersonaManager)
  const [selectedId, setSelectedId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 默认选中第一个；选中项被删除后自动回落
  useEffect(() => {
    if (!personas.some((p) => p.id === selectedId)) {
      setSelectedId(personas[0]?.id ?? '')
    }
  }, [personas, selectedId])

  // 未分组在前，其余按组名归置（组内保持原有顺序）
  const { ungrouped, groups } = useMemo(() => {
    const ungrouped = personas.filter((p) => !p.group?.trim())
    const map = new Map<string, Persona[]>()
    for (const p of personas) {
      const g = p.group?.trim()
      if (!g) continue
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    return { ungrouped, groups: [...map.entries()] }
  }, [personas])

  const toggleGroup = (g: string) => {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const selected = personas.find((p) => p.id === selectedId)

  return (
    <div className="flex-1 flex min-w-0">
      <div className="w-[280px] bg-mv-side border-r border-mv-border flex flex-col shrink-0 h-full">
        {/* 桌面端顶部拖拽条：与聊天 Header 同高对齐 */}
        {isDesktopApp && <div className="h-[54px] shrink-0" data-tauri-drag-region />}
        <div className="p-3">
          <button
            onClick={() => openPersonaManager()}
            className="w-full flex items-center justify-center gap-1.5 bg-mv-accent text-white text-sm px-3 py-2 rounded-lg hover:bg-mv-accent-hover transition-colors"
          >
            <Plus size={15} />
            新建人格
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-3">
          {ungrouped.map((p) => (
            <ContactItem key={p.id} persona={p} active={p.id === selectedId} onClick={() => setSelectedId(p.id)} />
          ))}
          {groups.map(([name, list]) => (
            <div key={name}>
              <button
                onClick={() => toggleGroup(name)}
                className="w-full flex items-center gap-1.5 px-4 py-1.5 text-xs text-mv-ink-4 hover:bg-mv-hover/60"
              >
                {collapsed.has(name) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <span className="font-medium">{name}</span>
                <span className="ml-auto">{list.length}</span>
              </button>
              {!collapsed.has(name) &&
                list.map((p) => (
                  <ContactItem key={p.id} persona={p} active={p.id === selectedId} onClick={() => setSelectedId(p.id)} />
                ))}
            </div>
          ))}
          {!personas.length && (
            <div className="text-center text-[13px] text-mv-ink-4 mt-10 px-6">还没有人格</div>
          )}
        </div>
      </div>
      {selected ? (
        <DetailPane persona={selected} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-mv-ink-4">
          先创建一个人格吧
        </div>
      )}
    </div>
  )
}
