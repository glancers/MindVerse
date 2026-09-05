import type { Persona } from '../../types'

/** 微信式圆角方形头像 */
export default function Avatar({ persona, size = 36 }: { persona?: Persona; size?: number }) {
  const style = { width: size, height: size }
  if (persona?.avatar) {
    return (
      <img
        src={persona.avatar}
        alt={persona.name}
        style={style}
        className="rounded-[5px] object-contain bg-mv-hover shrink-0"
      />
    )
  }
  const color = persona?.color ?? '#7C8087'
  const label = persona?.name?.[0] ?? '?'
  return (
    <div
      style={{ ...style, backgroundColor: color, fontSize: Math.round(size * 0.42) }}
      className="rounded-[5px] flex items-center justify-center text-white font-semibold shrink-0 select-none"
    >
      {label}
    </div>
  )
}
