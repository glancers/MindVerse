import { create } from 'zustand'
import { uid } from '../utils/id'

export type ToastType = 'success' | 'error' | 'info'
export interface ToastItem {
  id: string
  type: ToastType
  text: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (type: ToastType, text: string) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(type, text) {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, type, text }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2500)
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = {
  success: (text: string) => useToastStore.getState().push('success', text),
  error: (text: string) => useToastStore.getState().push('error', text),
  info: (text: string) => useToastStore.getState().push('info', text),
}
