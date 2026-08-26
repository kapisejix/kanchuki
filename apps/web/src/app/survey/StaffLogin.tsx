import { useState, useEffect, type FormEvent } from 'react'
import { Lock, Send, Sparkles, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export interface TeamSession {
  token: string
  name: string
}

export function StaffLogin({ onLogin }: { onLogin: (session: TeamSession) => void }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  async function sendOtp(e?: FormEvent) {
    if (e) e.preventDefault()
    if (phone.length !== 10) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Could not send OTP')
      }
      setStage('otp')
      setResendTimer(30)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP — check number and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault()
    if (otp.length < 4) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      })
      const json = await res.json()
      const token = json?.data?.access_token
      const isStaff = json?.data?.is_staff
      if (!res.ok || !token || !isStaff) {
        throw new Error(json?.error?.message ?? 'Invalid OTP code or this number is not a registered staff member.')
      }
      onLogin({
        token,
        name: json.data.team_member?.name ?? 'Staff Member',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code or unregistered staff member.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/90 backdrop-blur-xl border border-amber-200/60 rounded-3xl shadow-xl shadow-amber-900/5 p-8 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/20 border border-amber-300/40 text-amber-700 flex items-center justify-center mx-auto mb-5 shadow-xs">
          <Lock size={24} strokeWidth={1.75} />
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1.5 flex items-center justify-center gap-2">
          Field Staff Portal
          <Sparkles size={16} className="text-amber-500" />
        </h1>
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Log in with your registered staff phone number to access the Retailer Discovery & Market Survey tool.
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs text-left"
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {stage === 'phone' ? (
            <motion.form
              key="phone-stage"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={sendOtp}
              className="space-y-4 text-left"
            >
              <div>
                <label htmlFor="staffPhone" className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Mobile Number
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-semibold text-gray-400 select-none">
                    +91
                  </span>
                  <input
                    id="staffPhone"
                    type="tel"
                    inputMode="numeric"
                    required
                    autoFocus
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 10-digit number"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || phone.length !== 10}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending OTP…
                  </>
                ) : (
                  <>
                    <span>Send Login Code</span>
                    <Send size={15} />
                  </>
                )}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="otp-stage"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={verifyOtp}
              className="space-y-4 text-left"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="staffOtp" className="text-xs font-semibold text-gray-700">
                    Enter OTP Code
                  </label>
                  <span className="text-[11px] text-gray-400 font-mono">+91 {phone}</span>
                </div>
                <input
                  id="staffOtp"
                  type="text"
                  inputMode="numeric"
                  required
                  autoFocus
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full px-4 py-3 bg-gray-50/80 border border-gray-200 rounded-xl text-center text-lg font-mono tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={busy || otp.length < 4}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Verify & Open Survey</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStage('phone')
                    setOtp('')
                    setError('')
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft size={12} />
                  Change number
                </button>

                {resendTimer > 0 ? (
                  <span className="text-xs text-gray-400 font-medium">Resend in {resendTimer}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendOtp()}
                    disabled={busy}
                    className="text-xs text-amber-700 hover:text-amber-800 font-semibold transition-colors disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
