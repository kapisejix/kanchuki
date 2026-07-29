// Loom logomark — two interlaced thread lines (warp/weft), the concrete
// version of docs/design/emil-design.md §3.8. Wordmark-led brand: this
// mark is a supporting device, not a standalone icon meant to carry
// recognition on its own.
export function KanchukiMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`shrink-0 rounded-xl bg-ink-600 flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M4 4 L20 20" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        <path d="M20 4 L4 20" stroke="var(--color-turmeric)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}
