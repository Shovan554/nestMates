import Lottie from 'lottie-react'
import animation from '../assets/logo.json'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

const SIZES = {
  sm: { mark: 'h-10 w-10', text: 'text-xl', pull: '-ml-[13px]' },
  md: { mark: 'h-14 w-14', text: 'text-2xl', pull: '-ml-[17px]' },
  lg: { mark: 'h-24 w-24', text: 'text-4xl', pull: '-ml-[29px]' },
} as const

export default function Logo({ size = 'md', showText = true, className = '' }: Props) {
  const s = SIZES[size]
  return (
    <div className={`inline-flex items-center ${className}`}>
      <Lottie
        animationData={animation}
        loop
        autoplay
        className={s.mark}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
      {showText && (
        <span className={`font-semibold tracking-tight leading-none ${s.text} ${s.pull}`}>
          <span className="text-fuchsia-400">nest</span>
          <span className="text-cyan-400">mates</span>
        </span>
      )}
    </div>
  )
}
