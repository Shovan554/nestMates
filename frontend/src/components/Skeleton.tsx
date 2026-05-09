interface Props {
  className?: string
}

export default function Skeleton({ className = '' }: Props) {
  return (
    <div
      className={`bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer rounded-lg ${className}`}
    />
  )
}

export function SkeletonText({ width = 'w-full' }: { width?: string }) {
  return <Skeleton className={`h-3.5 ${width}`} />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-2/3" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-white">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}
