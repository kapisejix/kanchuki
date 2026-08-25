'use client'

// Client-only (form state + fetch) — posts to POST /v1/team/survey
// (apps/api/src/routes/team/team-survey.ts, staff-only via TEAM_JWT),
// stored as an AuditLog entry (resource_type RetailerSurvey). Data-driven
// (SECTIONS/UI in ./translations.ts) so the 3 languages share one render
// path instead of 3 copies of this component.

import { useState, type FormEvent } from 'react'
import { Send, Languages, LogOut } from 'lucide-react'
import { SECTIONS, UI, type Locale, type Question } from './translations'

const LANGS: { key: Locale; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'हिन्दी' },
  { key: 'pa', label: 'ਪੰਜਾਬੀ' },
]

const LIKERT_NAMES = SECTIONS.flatMap((s) => s.questions)
  .filter((q) => q.type === 'likert')
  .map((q) => q.name)

function Field({ q, locale }: { q: Question; locale: Locale }) {
  const label = q.label[locale]
  const hint = q.hint?.[locale]

  if (q.type === 'text' || q.type === 'tel') {
    return (
      <div className="q">
        <label className="qtext" htmlFor={q.name}>{label}</label>
        <input type={q.type} id={q.name} name={q.name} placeholder={q.placeholder?.[locale]} />
      </div>
    )
  }

  if (q.type === 'select') {
    return (
      <div className="q">
        <label className="qtext" htmlFor={q.name}>{label}</label>
        <select id={q.name} name={q.name} defaultValue="">
          <option value="" disabled>—</option>
          {q.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label[locale]}</option>
          ))}
        </select>
      </div>
    )
  }

  if (q.type === 'textarea') {
    return (
      <div className="q">
        <label className="qtext" htmlFor={q.name}>{label}</label>
        <textarea id={q.name} name={q.name} />
      </div>
    )
  }

  if (q.type === 'radio' || q.type === 'checkbox') {
    return (
      <div className="q">
        <span className="qtext">
          {label} {hint && <span className="hint">{hint}</span>}
        </span>
        {q.options?.map((o) => (
          <label key={o.value} className="opt">
            <input type={q.type} name={q.name} value={o.value} /> {o.label[locale]}
          </label>
        ))}
        {q.otherField && (
          <label className="opt other-field">
            {UI.otherLabel[locale]}{' '}
            <input type="text" name={q.otherField.name} placeholder={q.otherField.placeholder[locale]} />
          </label>
        )}
      </div>
    )
  }

  // likert (1–5)
  return (
    <div className="q">
      <span className="qtext">{label}</span>
      <div className="likert">
        <span className="likert-end">{UI.likertNotProblem[locale]}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="likert-col">
            <input type="radio" name={q.name} value={String(n)} />
            {n}
          </label>
        ))}
        <span className="likert-end">{UI.likertMajor[locale]}</span>
      </div>
    </div>
  )
}

export function SurveyForm({ token, staffName, onLogout }: { token: string; staffName: string; onLogout: () => void }) {
  const [locale, setLocale] = useState<Locale>('en')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    const payload: Record<string, string | string[]> = { locale }
    const checkboxNames = new Set(
      SECTIONS.flatMap((s) => s.questions).filter((q) => q.type === 'checkbox').map((q) => q.name),
    )
    for (const key of new Set(data.keys())) {
      const values = data.getAll(key).map(String).filter(Boolean)
      if (values.length === 0) continue
      payload[key] = checkboxNames.has(key) ? values : (values[0] ?? '')
    }

    setStatus('sending')
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/v1/team/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.status === 401 || res.status === 403) {
        onLogout()
        return
      }
      if (!res.ok) throw new Error('failed')
      setStatus('sent')
      form.reset()
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="survey-sent">
        <style>{SURVEY_CSS}</style>
        <p className="survey-sent-title">{UI.sentTitle[locale]}</p>
        <p>{UI.sentBody[locale]}</p>
        <button type="button" className="survey-submit" onClick={() => setStatus('idle')}>
          {UI.submitAnother[locale]}
        </button>
      </div>
    )
  }

  return (
    <div className="survey-wrap">
      <style>{SURVEY_CSS}</style>

      <div className="staff-bar">
        <span>{staffName}</span>
        <button type="button" onClick={onLogout}><LogOut size={13} strokeWidth={1.5} /> Log out</button>
      </div>

      <div className="lang-switch">
        <Languages size={16} strokeWidth={1.5} />
        {LANGS.map((l) => (
          <button
            key={l.key}
            type="button"
            className={locale === l.key ? 'active' : ''}
            onClick={() => setLocale(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {SECTIONS.map((section) => (
          <fieldset key={section.title.en}>
            <legend>{section.title[locale]}</legend>
            {section.questions.map((q) => (
              <Field key={q.name} q={q} locale={locale} />
            ))}
          </fieldset>
        ))}

        {status === 'error' && <p className="survey-error">{UI.errorMsg[locale]}</p>}

        <button type="submit" disabled={status === 'sending'} className="survey-submit">
          {status === 'sending' ? UI.sending[locale] : UI.submit[locale]} <Send size={16} strokeWidth={1.5} />
        </button>
      </form>
    </div>
  )
}

const SURVEY_CSS = `
.survey-wrap { max-width: 820px; margin: 0 auto; }
.staff-bar { display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; color: #6b6b6b; margin-bottom: 10px; }
.staff-bar button { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: #6b6b6b; font-size: 0.8rem; cursor: pointer; padding: 4px; }
.lang-switch { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; color: #6b6b6b; }
.lang-switch button { padding: 6px 14px; border-radius: 999px; border: 1px solid #ddd; background: #fff; font-size: 0.85rem; cursor: pointer; }
.lang-switch button.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
fieldset { border: 1px solid #ddd; border-radius: 8px; padding: 18px 20px 20px; margin: 0 0 20px; background: #faf9f6; }
legend { font-weight: 600; font-size: 1.05rem; padding: 0 8px; }
.q { margin: 14px 0; }
.qtext { display: block; font-weight: 600; margin-bottom: 6px; }
.hint { color: #6b6b6b; font-weight: 400; font-size: 0.85rem; }
.opt { display: block; margin: 2px 0; padding: 8px 4px; font-weight: 400; }
.opt input { margin-right: 10px; width: 18px; height: 18px; vertical-align: middle; }
input[type=text], input[type=tel], textarea, select {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px;
  /* 16px min — iOS Safari auto-zooms on focus below that */
  font-size: 16px; font-family: inherit;
}
textarea { resize: vertical; min-height: 60px; }
.likert { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.likert-col { display: flex; flex-direction: column; align-items: center; font-size: 0.8rem; gap: 4px; }
.likert-col input { width: 20px; height: 20px; }
.likert-end { font-size: 0.75rem; color: #6b6b6b; max-width: 90px; }
.other-field { margin-top: 6px; margin-left: 24px; }
.other-field input { max-width: 320px; display: inline-block; width: auto; }
.survey-error { color: #dc2626; font-size: 0.9rem; }
.survey-submit { display: inline-flex; align-items: center; gap: 8px; background: #b8860b; color: #fff; font-weight: 600; padding: 12px 28px; border-radius: 999px; border: none; cursor: pointer; }
.survey-submit:disabled { opacity: 0.5; cursor: default; }
.survey-sent { max-width: 600px; margin: 0 auto; text-align: center; padding: 60px 20px; }
.survey-sent-title { font-size: 1.3rem; font-weight: 700; margin-bottom: 8px; }
@media (max-width: 600px) {
  fieldset { padding: 14px 14px 16px; }
  legend { font-size: 0.95rem; }
  .likert { justify-content: center; }
  .likert-end { display: none; }
  .other-field { margin-left: 4px; }
  .other-field input { max-width: 100%; width: 100%; margin-top: 6px; display: block; }
}
`
