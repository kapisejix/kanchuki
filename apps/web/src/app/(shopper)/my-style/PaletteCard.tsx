'use client'

// F-045 PR-7: "your palette" after a selfie read. Shows colour FAMILIES only - never a
// skin-colour or body label (spec 4.3). "Clear my data" is shown as done only when the
// API confirms it (RC-060); a failure says so and can be retried.
import Link from 'next/link'
import { useRef, useState } from 'react'
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
    <ul className="flex flex-wrap gap-1.5 mt-1">
      {items.map((f) => (
        <li key={f} className={`px-2.5 py-1 rounded-full text-xs capitalize ${tone}`}>
          {f}
        </li>
      ))}
    </ul>
  )

  return (
    <section className="bg-white rounded-lg border border-stone-200 p-5">
      <h2 className="text-base font-semibold text-stone-900">Your palette</h2>
      {profile.palette ? (
        <div className="mt-2 space-y-3">
          <div>
            <p className="text-xs text-stone-500">Colours that suit you</p>
            {chips(profile.palette.good, 'bg-emerald-50 text-emerald-800 border border-emerald-200')}
          </div>
          {profile.palette.avoid.length > 0 && (
            <div>
              <p className="text-xs text-stone-500">Go easy on</p>
              {chips(profile.palette.avoid, 'bg-stone-100 text-stone-700 border border-stone-200')}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-stone-600 mt-2">
          Your look is saved. Colour suggestions will appear here soon.
        </p>
      )}

      <div className="flex gap-4 mt-4">
        <button type="button" onClick={onRetake} className="text-sm font-medium text-amber-700">
          Retake photo
        </button>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={status === 'clearing'}
          className="text-sm font-medium text-stone-600 disabled:opacity-50"
        >
          Clear my data
        </button>
      </div>

      {status === 'error' && (
        <p role="alert" className="text-xs text-red-700 mt-2">
          We could not clear your data. Please try again.
        </p>
      )}
      {status === 'signin' && (
        <p role="alert" className="text-xs text-stone-700 mt-2">
          Your session ended.{' '}
          <Link href={LOGIN_HREF} className="font-medium text-amber-700 underline">
            Please sign in
          </Link>{' '}
          to clear your data.
        </p>
      )}
    </section>
  )
}
