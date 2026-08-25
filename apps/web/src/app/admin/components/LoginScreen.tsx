'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Mail,
  Lock,
  Loader2,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'
import { resetAdminFetchCache } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type LoginTab = 'password' | 'otp'
type FlowState = 'login' | 'forgot_password' | 'reset_password'

export function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [tab, setTab] = useState<LoginTab>('password')
  const [flow, setFlow] = useState<FlowState>('login')

  // Password fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // OTP fields
  const [identifier, setIdentifier] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpDestination, setOtpDestination] = useState('')

  // Password Reset fields
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  // UI state
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [tab, flow])

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      // Try admin/superadmin login first, fall back to team member login
      let res = await fetch(`${API_URL}/v1/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      let json = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { token?: string } }
        | null

      if (!res.ok) {
        // Try team login
        const teamRes = await fetch(`${API_URL}/v1/team/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const teamJson = (await teamRes.json().catch(() => null)) as
          | { error?: { message?: string }; data?: { token?: string } }
          | null

        if (teamRes.ok && teamJson?.data?.token) {
          res = teamRes
          json = teamJson
        } else {
          throw new Error(json?.error?.message ?? teamJson?.error?.message ?? 'Invalid email or password')
        }
      }

      const token = json?.data?.token
      if (!token) throw new Error('No token returned')

      resetAdminFetchCache()
      sessionStorage.setItem('admin_key', token)
      onLogin(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setShakeKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/v1/team/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })

      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { message?: string; destination?: string } }
        | null

      if (!res.ok) {
        throw new Error(json?.error?.message ?? 'Failed to send OTP')
      }

      setOtpDestination(json?.data?.destination ?? identifier)
      setOtpSent(true)
      setSuccessMsg(json?.data?.message ?? 'OTP sent successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP')
      setShakeKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/v1/team/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, otp: otpCode }),
      })

      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; data?: { token?: string } }
        | null

      if (!res.ok) {
        throw new Error(json?.error?.message ?? 'Invalid or expired OTP code')
      }

      const token = json?.data?.token
      if (!token) throw new Error('No token returned')

      resetAdminFetchCache()
      sessionStorage.setItem('admin_key', token)
      onLogin(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setShakeKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/v1/team/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error?.message ?? 'Request failed')

      setSuccessMsg(json?.data?.message ?? 'Verification code sent to your email.')
      setFlow('reset_password')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reset')
      setShakeKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/v1/team/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          reset_code: resetCode,
          new_password: newPassword,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to reset password')

      setResetSuccess(true)
      setSuccessMsg(json?.data?.message ?? 'Password reset successfully!')
      setTimeout(() => {
        setFlow('login')
        setTab('password')
        setEmail(resetEmail)
        setResetSuccess(false)
        setError('')
        setSuccessMsg('')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
      setShakeKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-gray-950">
      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <motion.div
        key={shakeKey}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Glow behind card */}
        <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-cyan-500/20 rounded-3xl blur-2xl opacity-70" />

        {/* Login card */}
        <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-7 sm:p-9 border border-white/[0.08] shadow-2xl">
          {/* Decorative top gradient line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="flex items-center justify-center mb-6"
          >
            <div className="relative">
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-cyan-500/30">
                <Shield size={26} className="text-white" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute -inset-1 rounded-2xl border border-cyan-400/20"
              />
            </div>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="text-center mb-6"
          >
            <h1 className="text-xl font-bold text-white mb-1">
              {flow === 'login' ? 'Admin & Team Portal' : 'Reset Password'}
            </h1>
            <p className="text-xs text-gray-400">
              {flow === 'login'
                ? 'Sign in with Password or Instant Mobile OTP'
                : 'Enter your email to receive a verification code'}
            </p>
          </motion.div>

          {/* Dual Tabs (Password vs OTP) */}
          {flow === 'login' && (
            <div className="flex bg-white/5 p-1 rounded-xl mb-5 border border-white/5">
              <button
                type="button"
                onClick={() => {
                  setTab('password')
                  setError('')
                  setSuccessMsg('')
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  tab === 'password'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Lock size={13} />
                Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('otp')
                  setError('')
                  setSuccessMsg('')
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  tab === 'otp'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Smartphone size={13} />
                Mobile OTP
              </button>
            </div>
          )}

          {/* Messages */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key={shakeKey}
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -5, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl px-3.5 py-2.5 mb-4"
              >
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
            {successMsg && !error && (
              <motion.div
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -5, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl px-3.5 py-2.5 mb-4"
              >
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 1. PASSWORD LOGIN FORM */}
          {flow === 'login' && tab === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="group">
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">Email</label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                  />
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@kanchuki.app"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="group">
                <div className="flex items-center justify-between mb-1.5 ml-1">
                  <label className="text-xs font-medium text-gray-400">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setFlow('forgot_password')
                      setResetEmail(email)
                      setError('')
                      setSuccessMsg('')
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                    autoComplete="current-password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group text-sm mt-2"
              >
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Sign In with Password
                    </>
                  )}
                </span>
              </motion.button>
            </form>
          )}

          {/* 2. OTP LOGIN FORM */}
          {flow === 'login' && tab === 'otp' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="group">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">
                      Mobile Number or Email
                    </label>
                    <div className="relative">
                      <Smartphone
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                      />
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="10-digit phone or email"
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loading || identifier.trim().length < 3}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="relative w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group text-sm"
                  >
                    <span className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Sending Code...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          Send Sign-In OTP
                        </>
                      )}
                    </span>
                  </motion.button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="group">
                    <div className="flex items-center justify-between mb-1.5 ml-1">
                      <label className="text-xs font-medium text-gray-400">
                        Code sent to {otpDestination}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false)
                          setOtpCode('')
                          setError('')
                        }}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300"
                      >
                        Change
                      </button>
                    </div>
                    <div className="relative">
                      <KeyRound
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                      />
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit OTP code"
                        maxLength={6}
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-base text-white tracking-widest placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono"
                        autoFocus
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="relative w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group text-sm"
                  >
                    <span className="relative flex items-center justify-center gap-2">
                      {loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          Verify &amp; Sign In
                        </>
                      )}
                    </span>
                  </motion.button>
                </form>
              )}
            </div>
          )}

          {/* 3. FORGOT PASSWORD (REQUEST CODE) */}
          {flow === 'forgot_password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="group">
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">
                  Team Member Email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                  />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@kanchuki.app"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                    autoFocus
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading || !resetEmail.includes('@')}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60 text-sm"
              >
                {loading ? 'Sending code...' : 'Send Reset Code'}
              </motion.button>

              <button
                type="button"
                onClick={() => {
                  setFlow('login')
                  setError('')
                  setSuccessMsg('')
                }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </form>
          )}

          {/* 4. RESET PASSWORD (ENTER CODE & NEW PASSWORD) */}
          {flow === 'reset_password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="group">
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                  />
                  <input
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter code"
                    maxLength={6}
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 font-mono tracking-widest"
                    autoFocus
                    disabled={loading || resetSuccess}
                    required
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-xs font-medium text-gray-400 mb-1.5 ml-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-cyan-400 transition-colors"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    disabled={loading || resetSuccess}
                    required
                  />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={loading || resetCode.length !== 6 || newPassword.length < 8 || resetSuccess}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60 text-sm"
              >
                {loading ? 'Updating password...' : 'Update Password & Sign In'}
              </motion.button>

              <button
                type="button"
                onClick={() => {
                  setFlow('login')
                  setError('')
                  setSuccessMsg('')
                }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5 mt-2"
              >
                <ArrowLeft size={14} /> Cancel
              </button>
            </form>
          )}

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-6 text-center text-[11px] text-gray-600"
          >
            Secured with end-to-end encryption &amp; DLT-compliant OTP
          </motion.p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginScreen
