import { useEffect, type ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  overlayClassName?: string
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  overlayClassName = 'z-50',
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 ${overlayClassName} flex items-center justify-center bg-gray-900/40 backdrop-blur-sm px-4`}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <footer className="px-6 py-4 border-t border-gray-100 bg-gray-50/40 flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
