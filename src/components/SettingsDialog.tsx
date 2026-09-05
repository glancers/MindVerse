import { useEffect, useRef, useState } from 'react'
import { Check, Download, Eye, EyeOff, LogIn, LogOut, Plus, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import type { Provider, ProviderType } from '../types'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import { BACKGROUNDS, THEMES, THEME_DEFAULT_BG } from '../themes/themes'
import { confirmDialog } from '../stores/confirmStore'
import { toast } from '../stores/toastStore'
import { exportAllData, importAllData } from '../db/db'
import { syncAll } from '../services/repo'
import { ARK_PLAN_MODELS, fetchModels, testProvider } from '../services/llm/client'
import { uid } from '../utils/id'
import { isDesktopApp } from '../utils/desktop'
import Dialog from './common/Dialog'

const TYPE_LABEL: Record<ProviderType, string> = {
  ark: '火山方舟（OpenAI 兼容）',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  custom: '自定义（OpenAI 兼容）',
}

const TYPE_BASE_URL: Record<ProviderType, string> = {
  // 走本地代理（/ark → ark.cn-beijing.volces.com），绕过浏览器 CORS 限制
  ark: '/ark/api/plan/v3',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom: '',
}

const inputCls =
  'w-full border border-mv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-mv-accent bg-mv-panel text-mv-ink transition-colors'

/** 主题皮肤面板：迷你预览色板 + 点击即切换（即时生效）；背景与主题解耦，按主题记忆 */
function ThemeSection() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const backgrounds = useThemeStore((s) => s.backgrounds)
  const setBackground = useThemeStore((s) => s.setBackground)
  const currentTheme = THEMES.find((t) => t.id === theme)!
  const currentBg = backgrounds[theme] ?? THEME_DEFAULT_BG[theme] ?? 'none'

  return (
    <div className="p-5">
      <p className="text-xs text-mv-ink-4 mb-3">选择一套皮肤，点击立即生效（仅保存在本机）</p>
      <div className="grid grid-cols-2 gap-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`text-left rounded-xl border p-2.5 transition-colors ${
              theme === t.id
                ? 'border-mv-accent ring-1 ring-mv-accent'
                : 'border-mv-border hover:border-mv-ink-5'
            }`}
          >
            <div className="h-14 rounded-lg overflow-hidden flex relative" style={{ background: t.swatch.bg }}>
              <div className="w-8 shrink-0 h-full" style={{ background: t.swatch.rail }} />
              <div className="flex-1 p-1.5 flex flex-col justify-center gap-1.5 min-w-0">
                <div className="flex justify-end">
                  <span className="h-3 w-9 rounded-[3px]" style={{ background: t.swatch.bubbleMe }} />
                </div>
                <div className="flex justify-start">
                  <span
                    className="h-3 w-9 rounded-[3px] border"
                    style={{ background: t.swatch.panel, borderColor: t.swatch.rail }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="min-w-0">
                <div className="text-sm text-mv-ink flex items-center gap-1.5">
                  {t.name}
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.swatch.accent }} />
                </div>
                <div className="text-xs text-mv-ink-4 truncate">{t.desc}</div>
              </div>
              {theme === t.id && <Check size={15} className="text-mv-accent shrink-0" />}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-sm text-mv-ink font-medium">背景壁纸</p>
          <p className="text-xs text-mv-ink-4">
            为「{currentTheme.name}」选择背景，各主题独立记忆
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBackground(b.id)}
              className={`rounded-lg border overflow-hidden transition-colors ${
                currentBg === b.id
                  ? 'border-mv-accent ring-1 ring-mv-accent'
                  : 'border-mv-border hover:border-mv-ink-5'
              }`}
            >
              <div
                className="h-16 bg-cover bg-center"
                style={
                  b.url
                    ? { backgroundImage: `linear-gradient(rgba(128,128,128,0.15), rgba(128,128,128,0.15)), url(${b.url})` }
                    : { background: 'var(--mv-hover)' }
                }
              />
              <div className="px-1 py-1 text-[11px] text-mv-ink text-center truncate">{b.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function parseModels(text: string): string[] {
  return text
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function ProviderForm({
  initial,
  onDone,
}: {
  initial: { id: string; isNew: boolean; draft: Provider & { modelsText: string } }
  onDone: () => void
}) {
  const saveProvider = useSettingsStore((s) => s.saveProvider)
  const providers = useSettingsStore((s) => s.providers)
  const loggedIn = useAuthStore((s) => s.loggedIn)
  const [draft, setDraft] = useState(initial.draft)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [fetching, setFetching] = useState(false)

  const models = parseModels(draft.modelsText)
  // 服务器模式：编辑已保存的服务商时 Key 可留空（= 保持原 Key）
  const keyRequired = !loggedIn || initial.isNew || !providers.some((p) => p.id === initial.id)
  const canSave =
    draft.name.trim().length > 0 &&
    draft.baseURL.trim().length > 0 &&
    (!keyRequired || draft.apiKey.trim().length > 0) &&
    models.length > 0

  const save = async () => {
    if (!canSave) return
    await saveProvider({
      id: initial.id,
      type: draft.type,
      name: draft.name.trim(),
      baseURL: draft.baseURL.trim(),
      apiKey: draft.apiKey.trim(),
      models,
      defaultModel: draft.defaultModel || models[0],
    })
    toast.success('已保存')
    onDone()
  }

  /** 从服务商拉取模型列表；方舟 AgentPlan 无 /models 接口，失败时用官方清单兜底 */
  const doFetchModels = async () => {
    if (!draft.baseURL.trim()) {
      toast.error('请先填写 Base URL')
      return
    }
    // 服务器模式：必须已保存（服务端才有 Key）；本地模式仍需 Key
    if (!useAuthStore.getState().loggedIn && !draft.apiKey.trim()) {
      toast.error('请先填写 API Key')
      return
    }
    setFetching(true)
    try {
      // 已保存的服务商才传 id（服务器模式走后端代理）
      const saved = providers.some((p) => p.id === initial.id) && !initial.isNew
      const list = await fetchModels({
        id: saved ? initial.id : undefined,
        type: draft.type,
        baseURL: draft.baseURL.trim(),
        apiKey: draft.apiKey.trim(),
      })
      if (!list.length) throw new Error('返回的模型列表为空')
      setDraft((d) => ({ ...d, modelsText: list.join('\n'), defaultModel: '' }))
      toast.success(`已获取 ${list.length} 个模型`)
    } catch {
      if (draft.type === 'ark') {
        setDraft((d) => ({ ...d, modelsText: ARK_PLAN_MODELS.join('\n'), defaultModel: '' }))
        toast.info('该端点不提供模型列表接口，已填入官方 AgentPlan 模型清单')
      } else {
        toast.error('获取模型列表失败，请检查 Base URL 和 API Key，或手动填写')
      }
    } finally {
      setFetching(false)
    }
  }

  const doTest = async () => {
    const ms = parseModels(draft.modelsText)
    const model = draft.defaultModel || ms[0]
    if (!draft.baseURL.trim() || (keyRequired && !draft.apiKey.trim()) || !model) {
      toast.error('请先填写 Base URL、API Key 和模型')
      return
    }
    setTesting(true)
    try {
      const latency = await testProvider(
        {
          id: initial.id,
          type: draft.type,
          name: draft.name || '未命名',
          baseURL: draft.baseURL.trim(),
          apiKey: draft.apiKey.trim(),
          models: ms,
          defaultModel: model,
        },
        model,
      )
      toast.success(`连接成功，延迟 ${latency}ms`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '连接失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-mv-ink-4 block mb-1">服务商类型</label>
          <select
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as ProviderType
              setDraft((d) => ({
                ...d,
                type,
                baseURL: d.baseURL.trim() && d.baseURL !== TYPE_BASE_URL[d.type] ? d.baseURL : TYPE_BASE_URL[type],
              }))
            }}
            className={inputCls}
          >
            {Object.entries(TYPE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-mv-ink-4 block mb-1">显示名称 *</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="如：我的火山方舟"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">Base URL *</label>
        <input
          value={draft.baseURL}
          onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
          placeholder={TYPE_BASE_URL[draft.type] || 'https://…'}
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">API Key *（仅保存在本地）</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            placeholder="sk-…"
            className={`${inputCls} pr-10`}
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? '隐藏 Key' : '显示 Key'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-mv-ink-4 hover:text-mv-ink p-1"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-mv-ink-4">模型列表 *（逗号或换行分隔）</label>
          <button
            onClick={doFetchModels}
            disabled={fetching}
            className="text-xs text-mv-link hover:opacity-80 disabled:opacity-50"
          >
            {fetching ? '获取中…' : '获取模型列表'}
          </button>
        </div>
        <textarea
          value={draft.modelsText}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              modelsText: e.target.value,
              defaultModel: parseModels(e.target.value).includes(d.defaultModel) ? d.defaultModel : '',
            }))
          }
          rows={2}
          placeholder={'如：doubao-pro-32k\ndoubao-lite-32k'}
          className={`${inputCls} resize-y`}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1">默认模型</label>
        <select
          value={draft.defaultModel}
          onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
          className={inputCls}
        >
          <option value="">（取模型列表第一个）</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between pt-1">
        <button onClick={doTest} disabled={testing} className="text-sm text-mv-link hover:opacity-80 px-2 py-1 disabled:opacity-50">
          {testing ? '测试中…' : '测试连接'}
        </button>
        <div className="flex gap-2">
          <button onClick={onDone} className="px-4 py-1.5 rounded-lg text-sm text-mv-ink-4 hover:bg-mv-hover">
            取消
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-lg text-sm text-white bg-mv-accent ${
              canSave ? 'hover:bg-mv-accent-hover' : 'opacity-30 cursor-not-allowed'
            }`}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function ServerSection() {
  const { serverBase, username, loggedIn, setServerBase, login, register, logout } = useAuthStore()
  const [base, setBase] = useState(serverBase)
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = name.trim().length >= 2 && pass.length >= 6

  const doAuth = async (mode: 'login' | 'register') => {
    if (!canSubmit || busy) return
    setBusy(true)
    try {
      // 先落服务器地址（可能刚改过）
      if (base.replace(/\/+$/, '') !== serverBase) setServerBase(base)
      if (mode === 'login') await login(name.trim(), pass)
      else await register(name.trim(), pass)
      // 上行同步：把本地（离线）数据上传服务器，多端可见
      toast.info('正在同步本地数据到服务器…')
      await syncAll()
      toast.success(mode === 'login' ? `欢迎回来，${name.trim()}` : '注册成功')
      // 数据源切换为「本地优先 + 服务器同步」：重载页面让各 store 重新合并
      setTimeout(() => window.location.reload(), 400)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const doLogout = async () => {
    const ok = await confirmDialog({
      title: '退出登录',
      message: '退出后将回到本地模式（IndexedDB），服务器数据不受影响。',
      confirmText: '退出',
    })
    if (ok) logout()
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      {/* 桌面端：地址由内嵌服务自动分配，不开放手填 */}
      {!isDesktopApp && (
        <div>
          <label className="text-xs text-mv-ink-4 block mb-1.5">服务器地址</label>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            onBlur={() => setServerBase(base)}
            placeholder="留空 = 同源（开发走 vite 代理）"
            className={inputCls}
          />
        </div>
      )}
      {loggedIn ? (
        <div className="flex items-center justify-between border border-mv-accent/40 rounded-lg px-3 py-2.5 bg-mv-accent/5">
          <span className="text-sm text-mv-ink">
            已登录：<span className="font-medium">{username}</span>
            <span className="text-xs text-mv-ink-4 ml-2">数据存服务器，多端同步</span>
          </span>
          <button
            onClick={() => void doLogout()}
            className="flex items-center gap-1 text-xs text-mv-danger border border-mv-danger rounded-full px-3 py-1 hover:bg-mv-danger/10"
          >
            <LogOut size={12} />
            退出
          </button>
        </div>
      ) : (
        <div className="border border-mv-border rounded-lg p-3 flex flex-col gap-2.5">
          <p className="text-xs text-mv-ink-4">
            登录后本地数据自动上传服务器（多端同步、API Key 不进浏览器）；数据仍保留本地，离线可看。不登录继续用本地模式。
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="用户名（≥2 字符）"
              className={inputCls}
            />
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doAuth('login')
              }}
              placeholder="密码（≥6 位）"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void doAuth('login')}
              disabled={!canSubmit || busy}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm text-white bg-mv-accent ${
                canSubmit && !busy ? 'hover:bg-mv-accent-hover' : 'opacity-30 cursor-not-allowed'
              }`}
            >
              <LogIn size={14} />
              登录
            </button>
            <button
              onClick={() => void doAuth('register')}
              disabled={!canSubmit || busy}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-sm text-mv-link border border-mv-link/40 ${
                canSubmit && !busy ? 'hover:bg-mv-link-soft' : 'opacity-30 cursor-not-allowed'
              }`}
            >
              <UserPlus size={14} />
              注册
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GlobalSettings() {
  const { providers, activeProviderId, activeModel, defaultRounds, setDefault, setDefaultRounds } =
    useSettingsStore()
  const activeProvider = providers.find((p) => p.id === activeProviderId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  /** 导出全量数据为 JSON 备份文件 */
  const doExport = async () => {
    try {
      const payload = await exportAllData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      a.href = url
      a.download = `mindverse-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出备份文件')
    } catch {
      toast.error('导出失败')
    }
  }

  /** 选择文件后：先弹窗确认覆盖，再导入并刷新 */
  const doImport = async (file: File) => {
    const ok = await confirmDialog({
      title: '导入数据',
      message: '导入将覆盖当前所有数据（人格、会话、服务商、设置），且不可恢复。确定继续吗？',
      danger: true,
      confirmText: '覆盖导入',
    })
    if (!ok) return
    setImporting(true)
    try {
      const raw = JSON.parse(await file.text())
      await importAllData(raw)
      toast.success('导入成功，即将刷新页面')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
      setImporting(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1.5">全局默认模型（未被单独绑定的人格使用）</label>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={activeProviderId}
            onChange={(e) => {
              const p = providers.find((x) => x.id === e.target.value)
              void setDefault(e.target.value, p?.models[0] ?? '')
            }}
            className={inputCls}
          >
            {!providers.length && <option value="">暂无服务商</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={activeModel}
            onChange={(e) => void setDefault(activeProviderId, e.target.value)}
            disabled={!activeProvider}
            className={inputCls}
          >
            {activeProvider?.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1.5">接龙默认轮数（1–10）</label>
        <input
          type="number"
          min={1}
          max={10}
          value={defaultRounds}
          onChange={(e) => void setDefaultRounds(Number(e.target.value))}
          className={`${inputCls} w-32`}
        />
      </div>
      <div>
        <label className="text-xs text-mv-ink-4 block mb-1.5">数据管理</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void doExport()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-mv-accent border border-mv-accent/40 hover:bg-mv-accent-soft"
          >
            <Download size={14} />
            导出备份
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-mv-accent border border-mv-accent/40 hover:bg-mv-accent-soft disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {importing ? '导入中…' : '导入备份'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // 允许重复选择同一文件
              if (f) void doImport(f)
            }}
          />
        </div>
      </div>
      <p className="text-xs text-mv-ink-4 leading-5">
        所有数据（含 API Key）仅保存在本机浏览器 IndexedDB 中，不会上传。数据与访问端口绑定（固定为
        5175），换端口或换浏览器时请先用「导出备份」迁移。
      </p>
    </div>
  )
}

export default function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen)
  const close = useUIStore((s) => s.closeSettings)
  const providers = useSettingsStore((s) => s.providers)
  const deleteProvider = useSettingsStore((s) => s.deleteProvider)
  const [editingId, setEditingId] = useState<string | null>(null) // null=通用, 'theme'=主题皮肤, 'server'=服务器, 'new'=新建, id=编辑

  useEffect(() => {
    if (!open) setEditingId(null)
  }, [open])

  if (!open) return null

  const editing =
    editingId === 'new'
      ? {
          id: uid(),
          isNew: true,
          draft: {
            id: '',
            type: 'ark' as ProviderType,
            name: '',
            baseURL: TYPE_BASE_URL.ark,
            apiKey: '',
            models: [],
            defaultModel: '',
            modelsText: '',
          },
        }
      : editingId
        ? (() => {
            const p = providers.find((x) => x.id === editingId)
            return p
              ? { id: p.id, isNew: false, draft: { ...p, modelsText: p.models.join('\n') } }
              : null
          })()
        : null

  const doDelete = async (p: Provider) => {
    const ok = await confirmDialog({
      title: '删除服务商',
      message: `确定删除「${p.name}」吗？使用它的人格将回退到全局默认模型。`,
      danger: true,
      confirmText: '删除',
    })
    if (ok) {
      await deleteProvider(p.id)
      setEditingId(null)
    }
  }

  return (
    <Dialog title="设置" onClose={close} width={680}>
      <div className="flex min-h-[420px]">
        <div className="w-52 border-r border-mv-border p-3 flex flex-col gap-1 shrink-0">
          <button
            onClick={() => setEditingId(null)}
            className={`text-left px-3 py-2 rounded-lg text-sm ${
              editingId === null ? 'bg-mv-accent-soft text-mv-accent font-medium' : 'text-mv-ink hover:bg-mv-hover'
            }`}
          >
            通用设置
          </button>
          <button
            onClick={() => setEditingId('theme')}
            className={`text-left px-3 py-2 rounded-lg text-sm ${
              editingId === 'theme' ? 'bg-mv-accent-soft text-mv-accent font-medium' : 'text-mv-ink hover:bg-mv-hover'
            }`}
          >
            主题与背景
          </button>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditingId(p.id)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                editingId === p.id ? 'bg-mv-accent-soft text-mv-accent font-medium' : 'text-mv-ink hover:bg-mv-hover'
              }`}
            >
              <span className="truncate">{p.name}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  void doDelete(p)
                }}
                aria-label="删除服务商"
                className="text-mv-ink-4 hover:text-mv-danger p-0.5 shrink-0"
              >
                <Trash2 size={13} />
              </span>
            </button>
          ))}
          <button
            onClick={() => setEditingId('new')}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-mv-accent hover:bg-mv-accent-soft"
          >
            <Plus size={14} />
            添加服务商
          </button>
        </div>
        <div className="flex-1 min-w-0">
          {editingId === 'theme' ? (
            <ThemeSection />
          ) : editingId === 'server' ? (
            <ServerSection />
          ) : editing ? (
            <ProviderForm initial={editing} onDone={() => setEditingId(null)} />
          ) : (
            <GlobalSettings />
          )}
        </div>
      </div>
    </Dialog>
  )
}
