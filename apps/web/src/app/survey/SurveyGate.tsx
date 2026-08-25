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

export function SurveyGate() {
  const [session, setSession] = useState<TeamSession | null | undefined>(undefined)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      setSession(raw ? (JSON.parse(raw) as TeamSession) : null)
    } catch {
      setSession(null)
    }
  }, [])

  function handleLogin(s: TeamSession) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      // ponytail: localStorage can throw in private/locked-down browsers — session
      // just won't persist across reloads, login still works for this page view.
    }
    setSession(s)
  }

  function handleLogout() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* see handleLogin */
    }
    setSession(null)
  }

  if (session === undefined) return null // avoid a login-flash before localStorage is read
  if (!session) return <StaffLogin onLogin={handleLogin} />
  return <SurveyForm token={session.token} staffName={session.name} onLogout={handleLogout} />
}
