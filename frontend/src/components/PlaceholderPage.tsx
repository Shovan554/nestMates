interface Props {
  title: string
  phase: string
  hint: string
}

export default function PlaceholderPage({ title, phase, hint }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
          {phase}
        </p>
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      </div>

      <section className="bg-white rounded-2xl shadow-sm shadow-gray-200/40 border border-gray-100 p-10 text-center">
        <div className="text-5xl mb-4">🚧</div>
        <h2 className="text-lg font-semibold text-gray-900">Coming next</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{hint}</p>
      </section>
    </div>
  )
}
