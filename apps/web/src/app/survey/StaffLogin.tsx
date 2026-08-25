'use client'

// Staff-only phone+OTP gate for the survey tool. Reuses the existing
// POST /v1/auth/otp/send + /v1/auth/otp/verify endpoints (apps/api/src/
// routes/auth.ts) — verify() already resolves the phone against TeamMember
// and mints a TEAM_JWT (signTeamToken) when it matches, so no new backend
// auth code is needed here. A phone that isn't an active TeamMember gets no
// access_token back and the login just fails.
import { useState, type FormEvent } from 'react'
import { Lock, Send } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export interface TeamSession {
  token: string
  name: string
}

export function StaffLogin({ onLogin }: { onLogin: (session: TeamSession) => void }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')
  const [error, setError] = useState('')

  async function sendOtp(e: FormEvent) {
    e.preventDefault()
    setStatus('busy')
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) throw new Error()
      setStage('otp')
      setStatus('idle')
    } catch {
      setError('Could not send OTP — check the number and try again.')
      setStatus('idle')
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault()
    setStatus('busy')
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
        throw new Error()
      }
      onLogin({ token, name: json.data.team_member?.name ?? 'Staff' })
    } catch {
      setError('Invalid code, or this number is not a registered staff member.')
      setStatus('idle')
    }
  }

  return (
    <div className="staff-login">
      <style>{STAFF_LOGIN_CSS}</style>
      <div className="staff-login-icon"><Lock size={20} strokeWidth={1.5} /></div>
      <h2>Staff Login</h2>
      <p className="staff-login-hint">This survey is for Kanchuki field staff only. Log in with the phone number your admin registered.</p>

      {stage === 'phone' ? (
        <form onSubmit={sendOtp}>
          <label htmlFor="staffPhone">Phone number</label>
          <input
            id="staffPhone"
            type="tel"
            inputMode="numeric"
            required
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="10-digit mobile number"
          />
          {error && <p className="staff-login-error">{error}</p>}
          <button type="submit" disabled={status === 'busy' || phone.length !== 10}>
            {status === 'busy' ? 'Sending…' : 'Send OTP'} <Send size={15} strokeWidth={1.5} />
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp}>
          <label htmlFor="staffOtp">Enter the OTP sent to {phone}</label>
          <input
            id="staffOtp"
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="6-digit code"
          />
          {error && <p className="staff-login-error">{error}</p>}
          <button type="submit" disabled={status === 'busy' || otp.length < 4}>
            {status === 'busy' ? 'Verifying…' : 'Verify & Continue'}
          </button>
          <button type="button" className="staff-login-back" onClick={() => { setStage('phone'); setOtp(''); setError('') }}>
            Change number
          </button>
        </form>
      )}
    </div>
  )
}

const STAFF_LOGIN_CSS = `
.staff-login { max-width: 380px; margin: 40px auto; text-align: center; }
.staff-login-icon { width: 44px; height: 44px; border-radius: 999px; background: #faf0d9; color: #b8860b; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
.staff-login h2 { font-size: 1.2rem; margin: 0 0 6px; }
.staff-login-hint { color: #6b6b6b; font-size: 0.85rem; margin: 0 0 20px; }
.staff-login form { text-align: left; }
.staff-login label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 6px; }
.staff-login input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; margin-bottom: 12px; }
.staff-login-error { color: #dc2626; font-size: 0.85rem; margin: -4px 0 12px; }
.staff-login button[type=submit] { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #b8860b; color: #fff; font-weight: 600; padding: 12px; border-radius: 999px; border: none; cursor: pointer; }
.staff-login button[type=submit]:disabled { opacity: 0.5; }
.staff-login-back { display: block; width: 100%; margin-top: 10px; background: none; border: none; color: #6b6b6b; font-size: 0.85rem; cursor: pointer; }
`
