import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  _resolve?: (result: boolean) => void
  request: (opts: ConfirmOptions) => Promise<boolean>
  close: (result: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '', message: '' },
  request(opts) {
    return new Promise<boolean>((resolve) => {
      set({ open: true, options: opts, _resolve: resolve })
    })
  },
  close(result) {
    get()._resolve?.(result)
    set({ open: false, _resolve: undefined })
  },
}))

/** 全局确认弹窗（替代系统 confirm），用法：await confirmDialog({...}) */
export const confirmDialog = (opts: ConfirmOptions) => useConfirmStore.getState().request(opts)
