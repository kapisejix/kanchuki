'use client'

// Staff-only gate for /survey — holds the TEAM_JWT in localStorage (scoped
// to this browser only, cleared on logout or a 401/403 from the API) and
// swaps between StaffLogin and SurveyForm. No server-side redirect needed:
// the API route is what actually enforces the gate (teamAuthPreHandler),
// this is just the UI reflecting that.
import { useEffect, useState } from 'react'
import { StaffLogin, type TeamSession } from './StaffLogin'
import { SurveyForm } from './SurveyForm'

const STORAGE_KEY = 'kanchuki_survey_staff_session'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return decodeURIComponent(parts.pop()!.split(';').shift()!)
  return null
}

function setCookie(name: string, val: string, days = 30) {
  if (typeof document === 'undefined') return
  const maxAge = days * 24 * 60 * 60
  document.cookie = `${name}=${encodeURIComponent(val)}; max-age=${maxAge}; path=/; SameSite=Lax`
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`
}

export function SurveyGate() {
  const [session, setSession] = useState<TeamSession | null | undefined>(undefined)

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        raw = getCookie(STORAGE_KEY)
      }
      if (!raw) {
        raw = sessionStorage.getItem(STORAGE_KEY)
      }

      if (raw) {
        const parsed = JSON.parse(raw) as TeamSession
        if (parsed?.token) {
          setCookie(STORAGE_KEY, raw, 30)
          try {
            localStorage.setItem(STORAGE_KEY, raw)
          } catch {}
          setSession(parsed)
          return
        }
      }
      setSession(null)
    } catch {
      setSession(null)
    }
  }, [])

  function handleLogin(s: TeamSession) {
    try {
      const raw = JSON.stringify(s)
      localStorage.setItem(STORAGE_KEY, raw)
      sessionStorage.setItem(STORAGE_KEY, raw)
      setCookie(STORAGE_KEY, raw, 30)
    } catch {
      // ignore
    }
    setSession(s)
  }

  function handleLogout() {
    try {
      localStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(STORAGE_KEY)
      deleteCookie(STORAGE_KEY)
    } catch {
      // ignore
    }
    setSession(null)
  }

  if (session === undefined) return null // avoid a login-flash before session is read
  if (!session) return <StaffLogin onLogin={handleLogin} />
  return (
    <SurveyForm
      token={session.token}
      staffName={session.name}
      referralCode={session.referralCode}
      teamMemberId={session.teamMemberId}
      onLogout={handleLogout}
    />
  )
}
