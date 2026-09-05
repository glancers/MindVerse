import { createPortal } from 'react-dom'
import { useConfirmStore } from '../../stores/confirmStore'

export default function ConfirmHost() {
  const { open, options, close } = useConfirmStore()
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="dialog-enter bg-mv-panel rounded-2xl shadow-xl w-[360px] p-6 flex flex-col gap-4">
        <h2 className="text-[16px] font-semibold text-mv-ink">{options.title}</h2>
        <p className="text-sm text-mv-ink-4 leading-[22px]">{options.message}</p>
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={() => close(false)}
            className="px-4 py-1.5 rounded-lg text-sm text-mv-ink-4 hover:bg-mv-hover"
          >
            取消
          </button>
          <button
            onClick={() => close(true)}
            autoFocus
            className={`px-4 py-1.5 rounded-lg text-sm text-white transition-colors ${
              options.danger
                ? 'bg-mv-danger hover:opacity-90'
                : 'bg-mv-accent hover:bg-mv-accent-hover'
            }`}
          >
            {options.confirmText ?? '确认'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
