import { create } from 'zustand'
import type { Persona } from '../types'
import * as repo from '../services/repo'

interface PersonaState {
  personas: Persona[]
  loaded: boolean
  load: () => Promise<void>
  upsert: (p: Persona) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const usePersonaStore = create<PersonaState>((set) => ({
  personas: [],
  loaded: false,

  async load() {
    const personas = await repo.listPersonas()
    set({ personas, loaded: true })
  },

  async upsert(p) {
    const next = { ...p, updatedAt: Date.now() }
    await repo.putPersona(next)
    set((s) => {
      const list = [...s.personas]
      const i = list.findIndex((x) => x.id === next.id)
      if (i >= 0) list[i] = next
      else list.push(next)
      return { personas: list }
    })
  },

  async remove(id) {
    await repo.deletePersona(id)
    set((s) => ({ personas: s.personas.filter((p) => p.id !== id) }))
  },
}))
