'use client'

// Spec step 2: self-entered measurements. Shopper-only (never shown to a store), saved to the
// account, removable in one tap. There is deliberately no weight field. "Saved" is only
// reported when the API confirms it (RC-060).
import { MY_STYLE_MEASUREMENT_RANGES, feetInchesToCm, inMeasurementRange } from '@kanchuki/shared'
import { Ruler, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { BTN_SECONDARY, CARD, IconTile } from '../ui'
import { saveMeasurements } from './analyze'
import type { Measurements } from './lib'

type Field = 'height_cm' | 'bust_cm' | 'waist_cm' | 'hip_cm'
const LABEL: Record<Field, string> = {
  height_cm: 'Height',
  bust_cm: 'Bust / chest',
  waist_cm: 'Waist',
  hip_cm: 'Hip',
}
const FIELDS: Field[] = ['height_cm', 'bust_cm', 'waist_cm', 'hip_cm']
const INPUT = 'w-full rounded-xl border border-lavender-200 px-3 py-2 text-sm text-spaceCadet-900'

export function MeasurementsCard({
  initial,
  onSaved,
}: {
  initial: Measurements | null
  onSaved: () => void
}) {
  const [vals, setVals] = useState<Record<Field, string>>({
    height_cm: initial?.height_cm?.toString() ?? '',
    bust_cm: initial?.bust_cm?.toString() ?? '',
    waist_cm: initial?.waist_cm?.toString() ?? '',
    hip_cm: initial?.hip_cm?.toString() ?? '',
  })
  const [ftIn, setFtIn] = useState(false)
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false) // sync guard: two taps can land before state commits (RC-015)

  async function run(body: Parameters<typeof saveMeasurements>[0], okText: string) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const r = await saveMeasurements(body)
    busyRef.current = false
    setBusy(false)
    if (r === 'ok') {
      setMsg({ kind: 'ok', text: okText })
      onSaved()
    } else {
      setMsg({
        kind: 'error',
        text:
          r === 'unauthorized'
            ? 'Your session ended. Please sign in again.'
            : 'We could not save your measurements. Please try again.',
      })
    }
  }

  function save() {
    const body: Partial<Record<Field, number>> = {}
    for (const f of FIELDS) {
      let raw = vals[f].trim()
      if (f === 'height_cm' && ftIn) {
        raw =
          !feet.trim() && !inches.trim()
            ? ''
            : String(feetInchesToCm(Number(feet || 0), Number(inches || 0)))
      }
      if (!raw) continue
      const n = Number(raw)
      if (!inMeasurementRange(f, n)) {
        const r = MY_STYLE_MEASUREMENT_RANGES[f]
        setMsg({
          kind: 'error',
          text: `${LABEL[f]} should be a whole number between ${r.min} and ${r.max} cm.`,
        })
        return
      }
      body[f] = n
    }
    if (Object.keys(body).length === 0) {
      setMsg({ kind: 'error', text: 'Enter at least one measurement.' })
      return
    }
    void run(body, 'Saved. We will use it to suggest sizes.')
  }

  function remove() {
    setVals({ height_cm: '', bust_cm: '', waist_cm: '', hip_cm: '' })
    setFeet('')
    setInches('')
    void run(
      { height_cm: null, bust_cm: null, waist_cm: null, hip_cm: null },
      'Your measurements were removed.',
    )
  }

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center gap-3">
        <IconTile icon={Ruler} />
        <h2 className="text-base font-bold text-spaceCadet-900">Your measurements</h2>
      </div>
      <p className="text-xs text-heliotrope-500 mt-3">
        Only you can see these. They are saved to your account to suggest sizes, and are never shown to a
        store. You can delete them any time.
      </p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="col-span-2">
          <div className="flex items-center justify-between">
            <label htmlFor="m-height" className="text-xs font-semibold text-heliotrope-500">
              {ftIn ? 'Height (feet and inches)' : 'Height (cm)'}
            </label>
            <button
              type="button"
              onClick={() => setFtIn((v) => !v)}
              className="text-xs font-semibold text-fuchsia-600 underline"
            >
              {ftIn ? 'Use cm' : 'Use ft/in'}
            </button>
          </div>
          {ftIn ? (
            <div className="flex gap-2 mt-1">
              <input
                aria-label="Feet"
                inputMode="numeric"
                value={feet}
                onChange={(e) => setFeet(e.target.value)}
                className={INPUT}
                placeholder="ft"
              />
              <input
                aria-label="Inches"
                inputMode="numeric"
                value={inches}
                onChange={(e) => setInches(e.target.value)}
                className={INPUT}
                placeholder="in"
              />
            </div>
          ) : (
            <input
              id="m-height"
              inputMode="numeric"
              value={vals.height_cm}
              onChange={(e) => setVals((v) => ({ ...v, height_cm: e.target.value }))}
              className={`${INPUT} mt-1`}
            />
          )}
        </div>
        {(['bust_cm', 'waist_cm', 'hip_cm'] as Field[]).map((f) => (
          <div key={f}>
            <label htmlFor={`m-${f}`} className="text-xs font-semibold text-heliotrope-500">
              {LABEL[f]} (cm)
            </label>
            <input
              id={`m-${f}`}
              inputMode="numeric"
              value={vals[f]}
              onChange={(e) => setVals((v) => ({ ...v, [f]: e.target.value }))}
              className={`${INPUT} mt-1`}
            />
          </div>
        ))}
      </div>

      <details className="mt-3 text-xs text-heliotrope-500">
        <summary className="cursor-pointer font-semibold">How to measure</summary>
        <p className="mt-1">
          Use a soft tape over thin clothes, snug but not tight. Bust: around the fullest part. Waist: the
          narrowest part, above the navel. Hip: around the fullest part. Height: standing straight, no
          shoes. Sizes are approximate.
        </p>
      </details>

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={save} disabled={busy} className={BTN_SECONDARY}>
          Save measurements
        </button>
        {initial && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className={BTN_SECONDARY.replace('text-spaceCadet-900', 'text-red-700')}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Remove my measurements
          </button>
        )}
      </div>

      {msg && (
        <p
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs mt-3 ${msg.kind === 'error' ? 'text-red-700' : 'text-heliotrope-500'}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  )
}
