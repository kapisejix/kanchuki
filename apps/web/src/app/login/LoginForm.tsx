'use client'

import { Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  isMsg91WidgetConfigured,
  loadMsg91Widget,
  retryOtpViaWidget,
  sendOtpViaWidget,
  verifyOtpViaWidget,
  widgetErrorMessage,
} from '@/lib/msg91-widget'
import { clearPassportCache, getPassportSession } from '@/lib/passport-client'
import { DEFAULT_RETURN_TO, sanitizeReturnTo } from '@/lib/return-to'

// Customer login. The passport OTP flow lives here as its own surface so an
// installed-icon launch (start_url → /my-stores) has somewhere to complete
// login and then continue to the page it was heading for.
//
// The OTP dance mirrors ContactGate on store pages — widget first (its
// provisioned route bypasses the DLT-blocked sender), API as the fallback, and
// verify follows whichever channel issued the code.

interface Props {
  /** Destination after a successful login. Already sanitised by the page. */
  returnTo: string
}

export function LoginForm({ returnTo }: Props) {
  const router = useRouter()

  // Validated here as well as in page.tsx: this value becomes a navigation, so
  // the check lives at the boundary that performs it.
  const destination = sanitizeReturnTo(returnTo)

  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendTimer, setResendTimer] = useState(0)
  const [resending, setResending] = useState(false)

  // MSG91 widget session: reqId pairs verify/retry with the original send, and
  // channel records which path issued the OTP so verify/resend follow it.
  const [widgetReady, setWidgetReady] = useState(false)
  const [reqId, setReqId] = useState('')
  const [channel, setChannel] = useState<'widget' | 'api' | null>(null)

  // Sync ref alongside the state — a keyboard-submit and a button tap can both
  // read stale `sending === false` before the state update commits (the
  // double-SMS class of bug fixed in RC-015).
  const sendingRef = useRef(false)

  // A visitor who already holds a passport has nothing to do here, so send them
  // on to where they were going instead of showing them a login form.
  useEffect(() => {
    let cancelled = false
    getPassportSession()
      .then((account) => {
        if (cancelled) return
        if (account) {
          router.replace(destination)
          return
        }
        setChecking(false)
      })
      .catch(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [router, destination])

  useEffect(() => {
    if (resendTimer <= 0) return
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000)
    return () => clearInterval(timer)
  }, [resendTimer])

  // Lazily load the widget — the form works without it, so a blocked
  // third-party CDN cannot take login down.
  useEffect(() => {
    let cancelled = false
    if (isMsg91WidgetConfigured()) {
      void loadMsg91Widget().then((ready) => {
        if (!cancelled) setWidgetReady(ready)
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const sendViaApi = async () => {
    const res = await fetch('/api/passport/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim() }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(json?.error?.message ?? 'Failed to send OTP')
    }
  }

  const handleSend = async () => {
    if (phone.trim().length < 10 || !consent || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      if (widgetReady) {
        // The widget sends the SMS itself (identifier needs the country code).
        const result = await sendOtpViaWidget(`91${phone.trim()}`)
        if (result.ok) {
          setChannel('widget')
          setReqId(result.reqId ?? '')
        } else {
          await sendViaApi()
          setChannel('api')
          setReqId('')
        }
      } else {
        await sendViaApi()
        setChannel('api')
        setReqId('')
      }
      setResendTimer(30)
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleVerify = async () => {
    if (code.trim().length !== 6 || verifying) return
    setVerifying(true)
    setError(null)
    try {
      let widgetToken: string | undefined
      if (channel === 'widget') {
        // The widget verifies client-side and returns a JWT; the API
        // re-confirms it with MSG91 server-side.
        const result = await verifyOtpViaWidget(code.trim(), reqId || undefined)
        if (!result.ok || !result.token) {
          throw new Error(widgetErrorMessage(result.error, 'Verification failed. Try again.'))
        }
        widgetToken = result.token
      }
      const res = await fetch('/api/passport/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          widgetToken
            ? { phone: phone.trim(), widget_token: widgetToken }
            : { phone: phone.trim(), otp: code.trim() },
        ),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(json?.error?.message ?? 'Invalid OTP')
      }

      // Invalidate the memoised session before handing over. getPassport only
      // ever serves a *positive* result from cache (a stored null is falsy and
      // falls through to the network), so this is not load-bearing today — it
      // is here so the guard cannot read a stale account from a previous
      // session during the transition, and so a future change that starts
      // caching negatives cannot reintroduce a bounce-loop.
      clearPassportCache()
      router.replace(destination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP')
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || resending) return
    setResending(true)
    setError(null)
    try {
      if (channel === 'widget' && reqId) {
        const result = await retryOtpViaWidget(reqId)
        if (!result.ok) await sendViaApi()
      } else {
        await sendViaApi()
      }
      setResendTimer(30)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP')
    } finally {
      setResending(false)
    }
  }

  const backToPhone = () => {
    setStep('phone')
    setError(null)
    setChannel(null)
    setReqId('')
    setResendTimer(0)
    setCode('')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-amber-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/" className="font-semibold text-stone-900 text-lg">
            Kanchuki
          </Link>
          <p className="text-stone-500 text-sm mt-1">
            {step === 'phone'
              ? 'Verify once to see every store you visit.'
              : `Code sent to ${phone.trim().replace(/(\d{2})\d+(\d{3})/, '$1****$2')}`}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          {step === 'phone' ? (
            <>
              <label
                htmlFor="login-phone"
                className="block text-xs font-medium text-stone-700 mb-1"
              >
                WhatsApp number
              </label>
              <input
                id="login-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                minLength={10}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-900 mb-4 focus:outline-none focus:border-amber-500"
                placeholder="10-digit mobile number"
              />

              <label className="flex items-start gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-stone-500 leading-relaxed">
                  I agree to receive collection updates on WhatsApp from stores I follow, and
                  accept Kanchuki&apos;s{' '}
                  <Link href="/privacy" target="_blank" className="text-amber-700 underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" target="_blank" className="text-amber-700 underline">
                    Terms of Service
                  </Link>
                  .
                </span>
              </label>

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={phone.trim().length < 10 || !consent || sending}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={15} />}
                {sending ? 'Sending…' : 'Send OTP'}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="login-otp" className="block text-xs font-medium text-stone-700 mb-1">
                6-digit code
              </label>
              <input
                id="login-otp"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                type="tel"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-900 mb-4 text-center tracking-[0.3em] font-mono focus:outline-none focus:border-amber-500"
                placeholder="------"
              />

              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={code.trim().length !== 6 || verifying}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors mb-3"
              >
                {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={15} />}
                {verifying ? 'Verifying…' : 'Verify and continue'}
              </button>

              {resendTimer > 0 ? (
                <p className="text-center text-xs text-stone-400 py-2">
                  Resend OTP in {resendTimer}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resending}
                  className="w-full text-amber-700 font-medium text-xs py-2 hover:underline"
                >
                  {resending ? 'Sending…' : 'Resend OTP'}
                </button>
              )}

              <button
                type="button"
                onClick={backToPhone}
                className="w-full text-stone-500 text-xs py-2 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              >
                ← Change number
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          You&apos;ll continue to {destination === DEFAULT_RETURN_TO ? 'your stores' : destination}.
        </p>
      </div>
    </div>
  )
}
