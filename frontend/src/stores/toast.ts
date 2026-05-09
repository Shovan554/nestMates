import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind, durationMs?: number) => void
  dismiss: (id: string) => void
}

let counter = 0
const nextId = () => `${Date.now()}-${counter++}`

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info', durationMs = 3500) => {
    const id = nextId()
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    if (durationMs > 0) {
      setTimeout(() => get().dismiss(id), durationMs)
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (m: string) => useToastStore.getState().push(m, 'info'),
  success: (m: string) => useToastStore.getState().push(m, 'success'),
  error: (m: string) => useToastStore.getState().push(m, 'error'),
  warning: (m: string) => useToastStore.getState().push(m, 'warning'),
}
