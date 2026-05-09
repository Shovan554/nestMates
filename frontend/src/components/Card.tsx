import type { ReactNode } from 'react'

interface Props {
  title?: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export default function Card({ title, eyebrow, action, children, className = '' }: Props) {
  return (
    <section
      className={`bg-white rounded-2xl shadow-sm shadow-gray-200/40 border border-gray-100 p-6 ${className}`}
    >
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between mb-4">
          <div>
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
                {eyebrow}
              </p>
            )}
            {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
