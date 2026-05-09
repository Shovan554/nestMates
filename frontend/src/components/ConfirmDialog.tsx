import { create } from 'zustand'
import Modal from './Modal'

interface ConfirmOpts {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  opts: ConfirmOpts | null
  resolve: ((v: boolean) => void) | null
  ask: (opts: ConfirmOpts) => Promise<boolean>
  close: (v: boolean) => void
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  opts: null,
  resolve: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ opts, resolve })
    }),
  close: (v) => {
    const r = get().resolve
    set({ opts: null, resolve: null })
    if (r) r(v)
  },
}))

export const confirmDialog = (opts: ConfirmOpts): Promise<boolean> =>
  useConfirmStore.getState().ask(opts)

export default function ConfirmDialogHost() {
  const opts = useConfirmStore((s) => s.opts)
  const close = useConfirmStore((s) => s.close)
  if (!opts) return null
  return (
    <Modal
      open={!!opts}
      onClose={() => close(false)}
      title={opts.title}
      overlayClassName="z-[60]"
      footer={
        <>
          <button
            type="button"
            onClick={() => close(false)}
            className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg"
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={`px-3.5 py-2 text-sm font-semibold text-white rounded-lg shadow-sm ${
              opts.destructive
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                : 'bg-primary-600 hover:bg-primary-700 shadow-primary-200'
            }`}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      {opts.message && <p className="text-sm text-gray-600">{opts.message}</p>}
    </Modal>
  )
}
