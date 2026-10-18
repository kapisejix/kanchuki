'use client'

// F-045 PR-7 T17: selfie capture sheet. Same flow as TryOnSheet (c/[slug]/components):
// consent FIRST - the file input does not exist until the shopper accepts, so there is
// no way to reach the camera behind the notice. Copy is imported from @kanchuki/shared
// so the words on screen are the words `consent_version` names.
//
// One close path (`onClose`) and no history entry, so there is nothing to pop twice
// (RC-065/RC-006). The submit guard is a ref, not state, because two events can land
// before React commits (RC-015). Polling is capped and stops on unmount.
import { MY_STYLE_CONSENT } from '@kanchuki/shared'
import { Camera, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { pollAnalysis, prepareUpload, startAnalysis } from './analyze'
import { LOGIN_HREF } from './lib'

type Step = 'consent' | 'capture' | 'processing' | 'done' | 'error' | 'signin'

const POLL_MS = 2500
const MAX_POLLS = 36 // 90 s; the server drops the job after 15 min

const btn =
  'w-full py-3 rounded-lg bg-stone-900 text-white text-sm font-semibold active:scale-[0.98] transition'
const quiet = 'w-full py-2.5 mt-2 text-xs font-medium text-stone-600'

export function AnalyzeSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('consent')
  const [message, setMessage] = useState('')
  const busyRef = useRef(false)
  const stoppedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  // Set up in the effect (not at first render) so a StrictMode remount gets a live
  // controller instead of the one its simulated cleanup already aborted.
  useEffect(() => {
    stoppedRef.current = false
    ctrlRef.current = new AbortController()
    return () => {
      stoppedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      ctrlRef.current?.abort()
    }
  }, [])

  const fail = (msg: string) => {
    busyRef.current = false
    setMessage(msg)
    setStep('error')
  }

  const pollLater = (jobId: string, n: number) => {
    timerRef.current = setTimeout(async () => {
      const r = await pollAnalysis(jobId, ctrlRef.current?.signal)
      if (stoppedRef.current) return
      if (r.kind === 'ready') {
        busyRef.current = false
        setStep('done')
        onDone()
      } else if (r.kind === 'failed') fail(r.message)
      else if (r.kind === 'unauthorized') setStep('signin')
      else if (r.kind === 'gone') fail('This photo is no longer available. Please try again.')
      else if (r.kind === 'aborted') return
      else if (n + 1 >= MAX_POLLS) {
        fail('This is taking longer than usual. Close this and check My Style again in a minute.')
      } else pollLater(jobId, n + 1)
    }, POLL_MS)
  }

  const handleFile = async (file: File) => {
    if (busyRef.current) return
    busyRef.current = true
    setStep('processing')

    let photo: Blob
    try {
      photo = await prepareUpload(file)
    } catch {
      if (!stoppedRef.current) {
        fail("We can't open that photo. Please take a new one, or choose a JPEG.")
      }
      return
    }
    const r = await startAnalysis(photo, ctrlRef.current?.signal)
    if (stoppedRef.current || r.kind === 'aborted') return
    if (r.kind === 'unauthorized') setStep('signin')
    else if (r.kind === 'error') fail(r.message)
    else pollLater(r.jobId, 0)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      overlayClassName="z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 pb-8 shadow-2xl max-h-[95vh] overflow-y-auto"
      maxHeightVh={95}
      ariaLabel="Read my photo"
    >
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-stone-900">My Style</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700"
        >
          <X size={16} />
        </button>
      </div>

      {step === 'consent' && (
        <div>
          <div className="flex items-center gap-2 mb-2 text-emerald-700">
            <ShieldCheck size={16} />
            <h2 className="text-base font-semibold text-stone-900">{MY_STYLE_CONSENT.title}</h2>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed mb-3">{MY_STYLE_CONSENT.intro}</p>
          <div className="space-y-2 mb-3">
            {MY_STYLE_CONSENT.points.map((p) => (
              <div key={p.label} className="p-3 rounded-lg border border-stone-200">
                <p className="text-xs font-semibold text-stone-900">{p.label}</p>
                <p className="text-xs text-stone-600 leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-600 mb-1">{MY_STYLE_CONSENT.training}</p>
          <p className="text-xs text-stone-500 mb-4">
            {MY_STYLE_CONSENT.withdrawal}{' '}
            <a
              href={MY_STYLE_CONSENT.full_notice_url}
              target="_blank"
              rel="noreferrer"
              className="text-amber-700 font-medium underline"
            >
              Read the full notice
            </a>
          </p>
          <button type="button" onClick={() => setStep('capture')} className={btn}>
            {MY_STYLE_CONSENT.acceptLabel}
          </button>
          <button type="button" onClick={onClose} className={quiet}>
            {MY_STYLE_CONSENT.declineLabel}
          </button>
        </div>
      )}

      {step === 'capture' && (
        <div className="text-center py-2">
          <p className="text-sm font-semibold text-stone-900 mb-1">Take a photo of yourself</p>
          <p className="text-xs text-stone-600 mb-5">
            Face the light, only you in the frame. A full-body photo works best.
          </p>
          <label
            className={`${btn} inline-flex items-center justify-center gap-2 cursor-pointer`}
          >
            <Camera size={16} />
            Open camera
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              data-testid="my-style-selfie-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>
        </div>
      )}

      {step === 'processing' && (
        <div className="text-center py-8" aria-live="polite">
          <Loader2 size={26} className="animate-spin mx-auto text-amber-700" />
          <p className="text-sm font-semibold text-stone-900 mt-3">Reading your photo…</p>
          <p className="text-xs text-stone-600 mt-1">This usually takes under a minute.</p>
        </div>
      )}

      {step === 'signin' && (
        <div className="text-center py-2">
          <p className="text-sm font-semibold text-stone-900 mb-1">Sign in to read your photo</p>
          <p className="text-xs text-stone-600 leading-relaxed mb-5">
            My Style saves your palette to your account, so you need to be signed in.
          </p>
          <a href={LOGIN_HREF} className={`${btn} block`}>
            Sign in
          </a>
          <button type="button" onClick={onClose} className={quiet}>
            Not now
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="text-center py-2">
          <p role="alert" className="text-sm font-semibold text-stone-900 py-4">
            {message}
          </p>
          <button
            type="button"
            onClick={() => {
              busyRef.current = false
              setStep('capture')
            }}
            className={btn}
          >
            Try again
          </button>
          <button type="button" onClick={onClose} className={quiet}>
            Close
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <p className="text-sm font-semibold text-stone-900">Your palette is ready</p>
          <p className="text-xs text-stone-600 mt-1 mb-5">
            Your picks now lean toward colours that suit you.
          </p>
          <button type="button" onClick={onClose} className={btn}>
            See my picks
          </button>
        </div>
      )}
    </Sheet>
  )
}
