interface Props {
  displayName: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeClass = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ displayName, avatarUrl, size = 'md' }: Props) {
  const cls = sizeClass[size]
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${cls} rounded-full object-cover ring-2 ring-white`}
      />
    )
  }
  return (
    <div
      className={`${cls} rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-semibold flex items-center justify-center ring-2 ring-white`}
      aria-label={displayName}
    >
      {initials(displayName)}
    </div>
  )
}
