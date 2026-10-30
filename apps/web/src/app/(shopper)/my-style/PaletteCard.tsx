'use client'

// F-045 PR-7: "your palette" after a selfie read. Shows colour FAMILIES only - never a
// skin-colour or body label (spec 4.3). "Clear my data" is shown as done only when the
// API confirms it (RC-060); a failure says so and can be retried.
import { Camera, Palette, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { BTN_SECONDARY, CARD, IconTile } from '../ui'
import { clearProfile } from './analyze'
import { LOGIN_HREF, type StyleProfile } from './lib'

type Status = 'idle' | 'clearing' | 'error' | 'signin'

export function PaletteCard({
  profile,
  onRetake,
  onCleared,
}: {
  profile: StyleProfile
  onRetake: () => void
  onCleared: () => void
}) {
  const [status, setStatus] = useState<Status>('idle')
  const busyRef = useRef(false) // sync guard: two taps can land before state commits (RC-015)

  async function clear() {
    if (busyRef.current) return
    busyRef.current = true
    setStatus('clearing')
    const r = await clearProfile()
    busyRef.current = false
    if (r === 'ok') {
      setStatus('idle')
      onCleared()
    } else setStatus(r === 'unauthorized' ? 'signin' : 'error')
  }

  const chips = (items: string[], tone: string) => (
    <ul className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((f) => (
        <li key={f} className={`px-3 py-1 rounded-full text-xs font-semibold capitalize border ${tone}`}>
          {f}
        </li>
      ))}
    </ul>
  )

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center gap-3">
        <IconTile icon={Palette} />
        <h2 className="text-base font-bold text-spaceCadet-900">Your palette</h2>
      </div>
      {profile.palette ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-heliotrope-500">Colours that suit you</p>
            {chips(profile.palette.good, 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20')}
          </div>
          {profile.palette.avoid.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-heliotrope-500">Go easy on</p>
              {chips(profile.palette.avoid, 'bg-lavender-50 text-heliotrope-600 border-lavender-200')}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-heliotrope-500 mt-3">
          Your look is saved. Colour suggestions will appear here soon.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        <button type="button" onClick={onRetake} className={BTN_SECONDARY}>
          <Camera aria-hidden className="h-4 w-4 text-heliotrope-500" />
          Retake photo
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={status === 'clearing'}
          className={BTN_SECONDARY.replace('text-spaceCadet-900', 'text-red-700')}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Clear my data
        </button>
      </div>

      {status === 'error' && (
        <p role="alert" className="text-xs text-red-700 mt-3">
          We could not clear your data. Please try again.
        </p>
      )}
      {status === 'signin' && (
        <p role="alert" className="text-xs text-heliotrope-500 mt-3">
          Your session ended.{' '}
          <Link href={LOGIN_HREF} className="font-semibold text-fuchsia-600 underline">
            Please sign in
          </Link>{' '}
          to clear your data.
        </p>
      )}
    </section>
  )
}
