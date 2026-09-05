import { createPortal } from 'react-dom'
import { useToastStore } from '../../stores/toastStore'

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  if (!toasts.length) return null
  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-enter bg-mv-panel shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm text-mv-ink"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              t.type === 'success' ? 'bg-mv-success' : t.type === 'error' ? 'bg-mv-danger' : 'bg-mv-link'
            }`}
          />
          <span className="max-w-[70vw] truncate">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}
