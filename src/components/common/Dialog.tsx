import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

/** 统一弹窗壳：遮罩 bg-black/60 backdrop-blur-sm + createPortal 全局渲染 */
export default function Dialog({ title, onClose, children, width = 560 }: DialogProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="dialog-enter bg-mv-panel rounded-2xl shadow-xl flex flex-col max-h-[85vh]"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-mv-border shrink-0">
          <h2 className="text-[15px] font-semibold text-mv-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-mv-ink-4 hover:text-mv-ink text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
