'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, LogIn, ShieldCheck, X } from 'lucide-react'
import { TRY_ON_CONSENT } from '@kanchuki/shared'
import { Sheet } from '@/components/Sheet'
import { RETURN_TO_PARAM, sanitizeReturnTo } from '@/lib/return-to'

// F-040 — customer-web virtual try-on.
//
// The consent screen comes FIRST and capture is not rendered until it is
// accepted — the file input simply does not exist while `step === 'consent'`,
// so there is no way to reach the camera behind the notice. That matters
// because the photo this produces is of a real person and the generated image
// is stored; the accepting tap is the assertion we send to the API as
// `?consent_version=`, which is the version stamped on the job row.
//
// The copy is imported from `@kanchuki/shared` (never written here) so the
// words on this screen are the exact words that version names. The API refuses
// a request with no version, so this screen is not decoration — it is what
// makes the request valid.
// The API's only 401 on this route is `UNAUTHORIZED` — "no passport session"
// (see `resolveTryOnContext`: a cookie-less public request throws before it
// reaches quota or storage). That is not a failure to report, it is a door to
// open: the shopper needs an account, and printing the API's sentence at them
// leaves them with nothing to do about it. So a 401 routes to its own `signin`
// step — copy that says *why* an account is needed, and the one control that
// resolves it. The raw message is never rendered, not even transiently.
type Step = 'consent' | 'capture' | 'processing' | 'result' | 'signin'

export function TryOnSheet({
  productId,
  productName,
  onClose,
}: {
  productId: string
  productName: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('consent')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(false)

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  const handleAccept = () => setStep('capture')

  // Hands off to the real login surface rather than growing a second OTP flow
  // in here — `/login` already carries the widget-then-API fallback and the
  // resend/retry pairing, and one copy of that dance is the point. `return_to`
  // brings the shopper back to this product page, the same bounce the
  // (shopper) layout does. It is run through the sanitizer even though it is
  // our own `location` — that module is the single place the open-redirect
  // decision is made, and this fails closed.
  //
  // Resolved once on mount, and a plain anchor rather than a client-side push:
  // logging in establishes a new session, so the return trip should be a fresh
  // document that re-reads it. (`window` is absent during SSR; the bare
  // `/login` then falls back to the login surface's own default destination.)
  const [loginHref] = useState(() =>
    typeof window === 'undefined'
      ? '/login'
      : `/login?${RETURN_TO_PARAM}=${encodeURIComponent(
          sanitizeReturnTo(`${window.location.pathname}${window.location.search}`),
        )}`,
  )

  const handleFile = async (file: File) => {
    setError(null)
    setPreviewUrl(URL.createObjectURL(file))
    setStep('processing')

    const form = new FormData()
    form.append('photo', file)

    try {
      const res = await fetch(
        `/api/products/${productId}/try-on?consent_version=${encodeURIComponent(
          TRY_ON_CONSENT.version,
        )}`,
        { method: 'POST', body: form },
      )
      const json = (await res.json().catch(() => null)) as
        | { data?: { job_id: string }; error?: { message?: string } }
        | null

      // 401 first, and deliberately not folded into the branch below: `!res.ok`
      // would also catch it, and `error.message` would then be the API's
      // sentence — the thing this step exists to replace.
      if (res.status === 401) {
        setStep('signin')
        return
      }

      if (!res.ok || !json?.data?.job_id) {
        setError(json?.error?.message ?? 'Could not start the try-on. Please try again.')
        setStep('result')
        return
      }

      poll(json.data.job_id)
    } catch {
      setError('Could not start the try-on. Please check your connection and try again.')
      setStep('result')
    }
  }

  const poll = (jobId: string) => {
    const tick = async () => {
      if (stoppedRef.current) return
      try {
        const res = await fetch(
          `/api/products/${productId}/try-on/status?job_id=${encodeURIComponent(jobId)}`,
        )

        // Session lapsed mid-run. Same 401 as the POST ("no passport session"),
        // and the same non-answer if it is swallowed: the API returns no
        // `data.status` for it, so without this arm `status` is undefined, no
        // branch matches, and the poller falls through to the `setTimeout` at
        // the bottom of `tick` and re-arms itself every 3s for as long as the
        // sheet is open — a spinner that can never resolve.
        //
        // The `return` is what ends the chain, not the screen change: it leaves
        // `tick` before that `setTimeout`, so no second read is ever scheduled.
        // `stoppedRef` is a separate guard, for the other way a poll dies — the
        // sheet closing with a read already in flight.
        if (res.status === 401) {
          setStep('signin')
          return
        }

        const json = (await res.json().catch(() => null)) as
          | { data?: { status: string; url?: string | null; error?: string } }
          | null
        const status = json?.data?.status

        if (status === 'ready' && json?.data?.url) {
          setResultUrl(json.data.url)
          setStep('result')
          return
        }
        if (status === 'failed') {
          setError(json?.data?.error ?? 'The try-on could not be generated. Please try again.')
          setStep('result')
          return
        }
        if (status === 'withdrawn') {
          // Consent was withdrawn mid-run and the stored image deleted. Terminal.
          setError('This try-on was withdrawn and its picture deleted.')
          setStep('result')
          return
        }
      } catch {
        // Transient — keep polling; the job may still be running.
      }
      if (!stoppedRef.current) pollRef.current = setTimeout(tick, 3000)
    }
    pollRef.current = setTimeout(tick, 3000)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      overlayClassName="z-[80] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="relative w-full max-w-md bg-[#F8F7FC] rounded-t-[32px] sm:rounded-[32px] p-5 pb-8 sm:p-6 shadow-2xl border border-[#E0E1F6] max-h-[95vh] overflow-y-auto"
      maxHeightVh={95}
      ariaLabel="Virtual try-on"
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#231F48] to-[#560A39] text-white flex items-center justify-center">
            <Camera size={14} />
          </div>
          <span className="text-xs font-bold text-[#231F48] truncate max-w-[200px]">
            Try it on — {productName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-[#231F48] shadow-sm border border-[#E0E1F6] hover:border-[#BB3F95] transition"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {step === 'consent' && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Virtual Try-On
            </span>
          </div>
          <h2 className="text-base leading-6 font-extrabold text-[#231F48] font-marcellus mb-2">
            {TRY_ON_CONSENT.title}
          </h2>
          <p className="text-xs text-[#6B4773] leading-relaxed mb-3">{TRY_ON_CONSENT.intro}</p>

          <div className="space-y-2.5 mb-3">
            {TRY_ON_CONSENT.points.map((point) => (
              <div key={point.label} className="p-3 bg-white rounded-2xl border border-[#E0E1F6]">
                <p className="text-[11px] font-extrabold text-[#231F48] mb-0.5">{point.label}</p>
                <p className="text-[11px] text-[#6B4773] leading-relaxed">{point.text}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#6B4773] leading-relaxed mb-1">{TRY_ON_CONSENT.training}</p>
          <p className="text-[11px] text-[#928EB2] leading-relaxed mb-4">
            {TRY_ON_CONSENT.withdrawal}{' '}
            <a
              href={TRY_ON_CONSENT.full_notice_url}
              target="_blank"
              rel="noreferrer"
              className="text-[#BB3F95] font-bold underline"
            >
              Read the full notice
            </a>
          </p>

          <button
            type="button"
            onClick={handleAccept}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white text-sm font-extrabold shadow-lg shadow-[#231F48]/25 active:scale-[0.98] transition"
          >
            {TRY_ON_CONSENT.acceptLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 mt-2 text-xs font-semibold text-[#6B4773]"
          >
            {TRY_ON_CONSENT.declineLabel}
          </button>
        </div>
      )}

      {step === 'capture' && (
        <div className="text-center py-4">
          <p className="text-sm font-bold text-[#231F48] mb-1">Take a photo of yourself</p>
          <p className="text-xs text-[#6B4773] mb-5">
            Stand facing the light. A clear, full-body photo works best.
          </p>
          <label className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white text-sm font-extrabold cursor-pointer active:scale-[0.98] transition">
            <Camera size={16} />
            Open camera
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              data-testid="try-on-selfie-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />
          </label>
        </div>
      )}

      {step === 'processing' && (
        <div className="text-center py-8">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Your photo"
              className="w-28 h-36 object-cover rounded-2xl mx-auto mb-4 border border-[#E0E1F6]"
            />
          )}
          <Loader2 size={26} className="animate-spin mx-auto text-[#BB3F95]" />
          <p className="text-sm font-bold text-[#231F48] mt-3">Making your picture…</p>
          <p className="text-xs text-[#6B4773] mt-1">This usually takes 20–60 seconds.</p>
        </div>
      )}

      {step === 'signin' && (
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-2xl bg-white border border-[#E0E1F6] flex items-center justify-center mx-auto mb-3">
            <LogIn size={20} className="text-[#BB3F95]" />
          </div>
          <p className="text-sm font-extrabold text-[#231F48] mb-1">Sign in to try this on</p>
          <p className="text-xs text-[#6B4773] leading-relaxed mb-5">
            Try-on needs your account. That is what keeps the picture yours — private to you and
            the store, and yours to withdraw from My Profile at any time.
          </p>
          <a
            href={loginHref}
            data-testid="try-on-signin"
            className="block w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white text-sm font-extrabold shadow-lg shadow-[#231F48]/25 active:scale-[0.98] transition"
          >
            Sign in
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 mt-2 text-xs font-semibold text-[#6B4773]"
          >
            Not now
          </button>
        </div>
      )}

      {step === 'result' && (
        <div className="text-center">
          {resultUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="You wearing this outfit"
                className="w-full max-h-[55vh] object-contain rounded-2xl border border-[#E0E1F6]"
              />
              <p className="text-[10px] text-[#928EB2] mt-2">
                Only you and the store can see this. Withdraw any time from My Profile.
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold text-[#231F48] py-6">{error ?? 'Something went wrong.'}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 mt-4 rounded-2xl bg-white border border-[#E0E1F6] text-sm font-bold text-[#231F48]"
          >
            Done
          </button>
        </div>
      )}
    </Sheet>
  )
}
