import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import type { Persona } from '../types'
import { usePersonaStore } from '../stores/personaStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { confirmDialog } from '../stores/confirmStore'
import { toast } from '../stores/toastStore'
import { uid } from '../utils/id'
import Dialog from './common/Dialog'
import Avatar from './common/Avatar'

const PALETTE = ['#E5484D', '#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#64748B', '#EC4899', '#14B8A6']

function pickColor(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function emptyPersona(): Persona {
  return {
    id: uid(),
    name: '',
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    traits: [],
    systemPrompt: '',
    isPreset: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const inputCls =
  'w-full border border-mv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-mv-accent bg-mv-panel text-mv-ink transition-colors'

/** 分组选择：可输入新建 + 下拉选已有分组（替代原生 datalist） */
function GroupPicker({ value, groups, onChange }: { value: string; groups: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = value.trim()

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value.slice(0, 20))
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="选择或输入分组名，留空不分组"
        className={`${inputCls} pr-8`}
      />
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-mv-ink-4 pointer-events-none" />
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-mv-panel border border-mv-border rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-mv-hover/60 ${
              !current ? 'text-mv-accent font-medium' : 'text-mv-ink-4'
            }`}
          >
            不分组
            {!current && <Check size={13} />}
          </button>
          {groups.map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => {
                onChange(g)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-mv-hover/60 ${
                current === g ? 'text-mv-accent font-medium' : 'text-mv-ink'
              }`}
            >
              <span className="truncate">{g}</span>
              {current === g && <Check size={13} className="shrink-0" />}
            </button>
          ))}
          {!groups.length && (
            <div className="px-3 py-1.5 text-xs text-mv-ink-4">暂无分组，输入名称即可创建</div>
          )}
        </div>
      )}
    </div>
  )
}

function PersonaForm({ initial, groups, onDone }: { initial: Persona; groups: string[]; onDone: () => void }) {
  const upsert = usePersonaStore((s) => s.upsert)
  const remove = usePersonaStore((s) => s.remove)
  const providers = useSettingsStore((s) => s.providers)
  const [draft, setDraft] = useState<Persona>({ ...initial })
  const [traitsText, setTraitsText] = useState(initial.traits.join('，'))
  const [binding, setBinding] = useState(
    initial.modelBinding ? `${initial.modelBinding.providerId}::${initial.modelBinding.model}` : '',
  )

  const canSave = draft.name.trim().length > 0 && draft.systemPrompt.trim().length > 0

  const save = async () => {
    if (!canSave) return
    const traits = traitsText
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5)
    let next: Persona = { ...draft, traits, group: draft.group?.trim() || undefined, updatedAt: Date.now() }
    if (binding) {
      const [providerId, model] = binding.split('::')
      next = { ...next, modelBinding: { providerId, model } }
    } else {
      next = { ...next, modelBinding: undefined }
    }
    if (initial.isPreset) {
      // 分组是整理属性而非人格设定：仅调整分组时原地移动，其余改动另存副本
      const defUnchanged =
        next.name === initial.name &&
        next.systemPrompt === initial.systemPrompt &&
        (next.tagline ?? '') === (initial.tagline ?? '') &&
        next.color === initial.color &&
        (next.avatar ?? '') === (initial.avatar ?? '') &&
        next.traits.join(',') === initial.traits.join(',') &&
        (next.modelBinding?.providerId ?? '') === (initial.modelBinding?.providerId ?? '') &&
        (next.modelBinding?.model ?? '') === (initial.modelBinding?.model ?? '')
      if (!defUnchanged) {
        next = { ...next, id: uid(), isPreset: false, name: `${next.name}（副本）` }
        toast.info('预设人格已另存为副本')
      }
    }
    await upsert(next)
    onDone()
  }

  const doDelete = async () => {
    const ok = await confirmDialog({
      title: '删除人格',
      message: `确定删除「${initial.name}」吗？已存在的会话不受影响，但该人格无法再被 @ 。`,
      danger: true,
      confirmText: '删除',
    })
    if (ok) {
      await remove(initial.id)
      onDone()
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      {initial.isPreset && (
        <div className="text-xs text-mv-ink-4 bg-mv-hover rounded-lg px-3 py-2">
          这是预设人格，不可直接修改。编辑后保存将创建副本。
        </div>
      )}
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-2">
          <Avatar persona={{ ...draft, name: draft.name || '?' }} size={56} />
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-mv-border bg-mv-panel"
            title="主题色"
            aria-label="主题色"
          />
        </div>
        <div className="flex-1 flex flex-col gap-3">
          <div>
            <label className="text-xs text-mv-ink-4 block mb-1">名字 *</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 20) })}
              placeholder="如：毒舌评论家"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-mv-ink-4 block mb-1">头像图片地址（可选）</label>
            <input
              value={draft.avatar ?? ''}
              onChange={(e) => setDraft({ ...draft, avatar: e.target.value || undefined })}
              placeholder="https://…（留空自动生成色块头像）"
              className={inputCls}
            />
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">一句话简介</label>
        <input
          value={draft.tagline ?? ''}
          onChange={(e) => setDraft({ ...draft, tagline: e.target.value.slice(0, 50) })}
          placeholder="如：尖锐挑剔，找茬一针见血"
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">分组（可选）</label>
        <GroupPicker
          value={draft.group ?? ''}
          groups={groups}
          onChange={(v) => setDraft({ ...draft, group: v || undefined })}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">性格标签（逗号分隔，最多 5 个）</label>
        <input
          value={traitsText}
          onChange={(e) => setTraitsText(e.target.value)}
          placeholder="如：毒舌，幽默，挑剔"
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">人格设定（System Prompt）*</label>
        <textarea
          value={draft.systemPrompt}
          onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
          rows={5}
          placeholder="描述 TA 的说话方式、立场与性格…"
          className={`${inputCls} resize-y`}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">绑定模型</label>
        <select value={binding} onChange={(e) => setBinding(e.target.value)} className={inputCls}>
          <option value="">跟随全局默认模型</option>
          {providers.map((p) =>
            p.models.map((m) => (
              <option key={`${p.id}::${m}`} value={`${p.id}::${m}`}>
                {p.name} / {m}
              </option>
            )),
          )}
        </select>
      </div>
      <div className="flex items-center justify-between pt-1">
        {!initial.isPreset ? (
          <button
            onClick={doDelete}
            className="flex items-center gap-1 text-sm text-mv-danger hover:opacity-80 px-2 py-1"
          >
            <Trash2 size={14} />
            删除
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button onClick={onDone} className="px-4 py-1.5 rounded-lg text-sm text-mv-ink-4 hover:bg-mv-hover">
            取消
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-lg text-sm text-white bg-mv-link ${
              canSave ? 'hover:opacity-90' : 'opacity-30 cursor-not-allowed'
            }`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PersonaManager() {
  const open = useUIStore((s) => s.personaManagerOpen)
  const close = useUIStore((s) => s.closePersonaManager)
  const initial = useUIStore((s) => s.personaManagerInitial)
  const personas = usePersonaStore((s) => s.personas)
  const [editing, setEditing] = useState<Persona | null>(null)

  // 无初始人格 = 直接进新建表单（原「人格库」列表层已删除）
  useEffect(() => {
    if (open) setEditing(initial ?? emptyPersona())
  }, [open, initial])

  if (!open || !editing) return null

  const groups = [...new Set(personas.map((p) => p.group?.trim()).filter((g): g is string => !!g))]

  return (
    <Dialog title={editing.isPreset || editing.name ? '编辑人格' : '新建人格'} onClose={close} width={560}>
      <PersonaForm initial={editing} groups={groups} onDone={close} />
    </Dialog>
  )
}
