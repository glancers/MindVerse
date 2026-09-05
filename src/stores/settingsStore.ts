import { create } from 'zustand'
import type { Persona, Provider, Settings } from '../types'
import * as repo from '../services/repo'

interface SettingsState {
  providers: Provider[]
  activeProviderId: string
  activeModel: string
  defaultRounds: number
  loaded: boolean
  load: () => Promise<void>
  saveProvider: (p: Provider) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  setDefault: (providerId: string, model: string) => Promise<void>
  setDefaultRounds: (n: number) => Promise<void>
}

async function persistSettings(s: Omit<Settings, 'id'>) {
  await repo.putSettings({ id: 'global', ...s })
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: [],
  activeProviderId: '',
  activeModel: '',
  defaultRounds: 3,
  loaded: false,

  async load() {
    const [providers, settings] = await Promise.all([repo.listProviders(), repo.getSettings()])
    set({
      providers,
      activeProviderId: settings?.activeProviderId ?? '',
      activeModel: settings?.activeModel ?? '',
      defaultRounds: settings?.defaultRounds ?? 3,
      loaded: true,
    })
  },

  async saveProvider(p) {
    await repo.putProvider(p)
    const providers = [...get().providers]
    const i = providers.findIndex((x) => x.id === p.id)
    if (i >= 0) providers[i] = p
    else providers.push(p)
    let { activeProviderId, activeModel } = get()
    // 首个 Provider 或当前默认已失效时，自动设为默认
    if (!activeProviderId || !providers.some((x) => x.id === activeProviderId)) {
      activeProviderId = p.id
      activeModel = p.defaultModel || p.models[0] || ''
    }
    await persistSettings({ activeProviderId, activeModel, defaultRounds: get().defaultRounds })
    set({ providers, activeProviderId, activeModel })
  },

  async deleteProvider(id) {
    await repo.deleteProvider(id)
    const providers = get().providers.filter((p) => p.id !== id)
    let { activeProviderId, activeModel } = get()
    if (activeProviderId === id) {
      const first = providers[0]
      activeProviderId = first?.id ?? ''
      activeModel = first?.defaultModel ?? ''
    }
    await persistSettings({ activeProviderId, activeModel, defaultRounds: get().defaultRounds })
    set({ providers, activeProviderId, activeModel })
  },

  async setDefault(providerId, model) {
    await persistSettings({
      activeProviderId: providerId,
      activeModel: model,
      defaultRounds: get().defaultRounds,
    })
    set({ activeProviderId: providerId, activeModel: model })
  },

  async setDefaultRounds(n) {
    const clamped = Math.min(10, Math.max(1, Math.round(n) || 1))
    await persistSettings({
      activeProviderId: get().activeProviderId,
      activeModel: get().activeModel,
      defaultRounds: clamped,
    })
    set({ defaultRounds: clamped })
  },
}))

/** 解析某人格实际使用的 provider + model（人格级绑定 > 全局默认） */
export function resolveModel(persona?: Persona): { provider: Provider; model: string } | null {
  const s = useSettingsStore.getState()
  if (persona?.modelBinding) {
    const provider = s.providers.find((p) => p.id === persona.modelBinding!.providerId)
    if (provider && persona.modelBinding.model) {
      return { provider, model: persona.modelBinding.model }
    }
  }
  const provider = s.providers.find((p) => p.id === s.activeProviderId)
  if (!provider || !s.activeModel) return null
  return { provider, model: s.activeModel }
}
