import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useToastStore, type Toast, type ToastKind } from '../stores/toast'

const STYLES: Record<ToastKind, { bg: string; border: string; text: string; iconColor: string; Icon: typeof CheckCircleIcon }> = {
  success: {
    bg: 'bg-accent-50',
    border: 'border-accent-200',
    text: 'text-accent-900',
    iconColor: 'text-accent-600',
    Icon: CheckCircleIcon,
  },
  error: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-900',
    iconColor: 'text-rose-600',
    Icon: ExclamationCircleIcon,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    iconColor: 'text-amber-600',
    Icon: ExclamationTriangleIcon,
  },
  info: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    text: 'text-primary-900',
    iconColor: 'text-primary-600',
    Icon: InformationCircleIcon,
  },
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = STYLES[toast.kind]
  const { Icon } = style
  return (
    <div
      role="status"
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg shadow-gray-900/5 animate-toast-in ${style.bg} ${style.border} ${style.text}`}
    >
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`} />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition shrink-0"
        aria-label="Dismiss"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
