'use client'

// Client-only (form state + fetch) — posts to POST /v1/team/survey
// (apps/api/src/routes/team/team-survey.ts, staff-only via TEAM_JWT),
// stored as an AuditLog entry (resource_type RetailerSurvey). Data-driven
// (SECTIONS/UI in ./translations.ts) so the 3 languages share one render
// path instead of 3 copies of this component.

import { useState, type FormEvent } from 'react'
import {
  Send,
  Languages,
  LogOut,
  Sparkles,
  CheckCircle2,
  Copy,
  Share2,
  QrCode,
  Check,
  UserCheck,
  Store,
  ExternalLink,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { SECTIONS, UI, LIKERT_LEVELS, type Locale, type Question } from './translations'

const LANGS: { key: Locale; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'हिन्दी' },
  { key: 'pa', label: 'ਪੰਜਾਬੀ' },
]

function LikertField({ q, locale }: { q: Question; locale: Locale }) {
  const [selected, setSelected] = useState<string>('')
  const label = q.label[locale]

  return (
    <div className="q">
      <span className="qtext font-medium text-gray-800 mb-2 block">{label}</span>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-1.5">
        {LIKERT_LEVELS.map((level) => {
          const isSelected = selected === level.value
          return (
            <label
              key={level.value}
              className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all text-center select-none ${
                isSelected
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm ring-2 ring-amber-500/30'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              <input
                type="radio"
                name={q.name}
                value={level.value}
                checked={isSelected}
                onChange={() => setSelected(level.value)}
                className="sr-only"
              />
              <span>{level.label[locale]}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function Field({ q, locale }: { q: Question; locale: Locale }) {
  const label = q.label[locale]
  const hint = q.hint?.[locale]

  if (q.type === 'likert') {
    return <LikertField q={q} locale={locale} />
  }

  if (q.type === 'text' || q.type === 'tel') {
    return (
      <div className="q">
        <label className="qtext font-medium text-gray-800 block mb-1.5" htmlFor={q.name}>
          {label}
        </label>
        <input
          type={q.type}
          id={q.name}
          name={q.name}
          placeholder={q.placeholder?.[locale]}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
        />
      </div>
    )
  }

  if (q.type === 'select') {
    return (
      <div className="q">
        <label className="qtext font-medium text-gray-800 block mb-1.5" htmlFor={q.name}>
          {label}
        </label>
        <select
          id={q.name}
          name={q.name}
          defaultValue=""
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
        >
          <option value="" disabled>
            — Select an option —
          </option>
          {q.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label[locale]}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (q.type === 'textarea') {
    return (
      <div className="q">
        <label className="qtext font-medium text-gray-800 block mb-1.5" htmlFor={q.name}>
          {label}
        </label>
        <textarea
          id={q.name}
          name={q.name}
          rows={3}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-all"
        />
      </div>
    )
  }

  if (q.type === 'radio' || q.type === 'checkbox') {
    return (
      <div className="q">
        <span className="qtext font-medium text-gray-800 block mb-1.5">
          {label} {hint && <span className="text-xs text-gray-500 font-normal ml-1">{hint}</span>}
        </span>
        <div className="space-y-1.5 pt-0.5">
          {q.options?.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-50/50 cursor-pointer text-sm text-gray-700 transition-colors"
            >
              <input
                type={q.type}
                name={q.name}
                value={o.value}
                className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
              />
              <span>{o.label[locale]}</span>
            </label>
          ))}
          {q.otherField && (
            <div className="flex items-center gap-2 pl-3 pt-1">
              <span className="text-xs font-semibold text-gray-500">{UI.otherLabel[locale]}</span>
              <input
                type="text"
                name={q.otherField.name}
                placeholder={q.otherField.placeholder[locale]}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs flex-1 max-w-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

interface SubmitResult {
  submissionId: string
  referralCode: string
  onboardingUrl: string
}

export function SurveyForm({
  token,
  staffName,
  referralCode: initialRefCode,
  teamMemberId,
  onLogout,
}: {
  token: string
  staffName: string
  referralCode?: string
  teamMemberId?: string
  onLogout: () => void
}) {
  const [locale, setLocale] = useState<Locale>('en')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  const activeRefCode = result?.referralCode || initialRefCode || teamMemberId || 'STAFF'
  const onboardingLink =
    result?.onboardingUrl || `https://kanchuki.com/for-retailers?ref=${activeRefCode}`

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    const payload: Record<string, string | string[]> = { locale }
    const checkboxNames = new Set(
      SECTIONS.flatMap((s) => s.questions)
        .filter((q) => q.type === 'checkbox')
        .map((q) => q.name),
    )
    for (const key of Array.from(new Set(data.keys()))) {
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
      const json = await res.json().catch(() => null)
      const dataObj = json?.data
      setResult({
        submissionId: dataObj?.submission_id ?? `SRV-${Date.now().toString(36).toUpperCase()}`,
        referralCode: dataObj?.referral_code ?? activeRefCode,
        onboardingUrl:
          dataObj?.onboarding_url ?? `https://kanchuki.com/for-retailers?ref=${activeRefCode}`,
      })
      setStatus('sent')
      form.reset()
    } catch {
      setStatus('error')
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(onboardingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const shareWhatsapp = () => {
    const text = encodeURIComponent(
      `Namaste! Create your clothing store's digital catalog in minutes on Kanchuki (AI auto-tagging + WhatsApp selling). Register here: ${onboardingLink}\n\nReferred by: ${staffName} (Code: ${activeRefCode})`,
    )
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank')
  }

  if (status === 'sent') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto bg-white/95 backdrop-blur-xl border border-amber-200/80 rounded-3xl shadow-xl shadow-amber-900/5 p-8 text-center"
      >
        <div className="w-16 h-16 rounded-3xl bg-green-50 text-green-600 border border-green-200 flex items-center justify-center mx-auto mb-4 shadow-xs">
          <CheckCircle2 size={32} />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{UI.sentTitle[locale]}</h2>
        <p className="text-xs text-gray-500 mb-6">{UI.sentBody[locale]}</p>

        {/* Reference & Referral Code Box */}
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 text-left mb-6 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/60">
                Sales Representative
              </p>
              <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mt-0.5">
                <UserCheck size={15} className="text-amber-700" />
                {staffName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/60">
                Lead Ref ID
              </p>
              <p className="text-xs font-mono font-semibold text-gray-700 mt-0.5">
                {result?.submissionId.slice(-8).toUpperCase()}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/60 mb-1">
              Your Staff Referral Code
            </p>
            <div className="flex items-center justify-between bg-white border border-amber-300 rounded-xl px-3.5 py-2">
              <span className="font-mono font-bold text-base text-amber-800 tracking-wider">
                {activeRefCode}
              </span>
              <span className="text-[11px] font-medium text-gray-500">
                Auto-applies during signup
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/60 mb-1">
              Retailer Onboarding Link
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={onboardingLink}
                className="text-xs font-mono bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 text-gray-600 select-all"
              />
              <button
                type="button"
                onClick={copyLink}
                className="px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Share & QR Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-6">
          <button
            type="button"
            onClick={shareWhatsapp}
            className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <Share2 size={14} />
            Share on WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <QrCode size={14} />
            {showQr ? 'Hide QR' : 'Show QR to Scan'}
          </button>
        </div>

        {showQr && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 text-center"
          >
            <p className="text-xs text-gray-500 mb-2">
              Ask retailer to scan this with their phone camera:
            </p>
            <div className="inline-block p-3 bg-white border border-gray-300 rounded-xl shadow-xs">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  onboardingLink,
                )}`}
                alt="Retailer Registration QR"
                width={180}
                height={180}
                className="mx-auto"
              />
            </div>
          </motion.div>
        )}

        <button
          type="button"
          onClick={() => {
            setStatus('idle')
            setResult(null)
          }}
          className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-semibold rounded-xl shadow-md transition-all"
        >
          {UI.submitAnother[locale]}
        </button>
      </motion.div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="bg-white/90 backdrop-blur-xl border border-amber-200/60 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
              Sales Portal
            </span>
            <span className="text-xs text-gray-400 font-mono">ID: {activeRefCode}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {UI.pageTitle[locale]}
            <Sparkles size={16} className="text-amber-500" />
          </h1>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">{UI.pageLead[locale]}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  locale === l.key
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setLocale(l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="p-2 text-gray-400 hover:text-red-600 rounded-xl hover:bg-gray-100 transition-colors"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {SECTIONS.map((section, idx) => (
          <motion.div
            key={section.title.en}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-white/90 backdrop-blur-xl border border-gray-200/90 rounded-3xl p-6 shadow-xs"
          >
            <h2 className="text-base font-bold text-gray-900 pb-3 mb-4 border-b border-gray-100 flex items-center gap-2">
              <Store size={18} className="text-amber-600" />
              {section.title[locale]}
            </h2>
            <div className="space-y-5">
              {section.questions.map((q) => (
                <Field key={q.name} q={q} locale={locale} />
              ))}
            </div>
          </motion.div>
        ))}

        {status === 'error' && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-medium">
            {UI.errorMsg[locale]}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full py-4 px-6 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-base font-bold rounded-2xl shadow-xl shadow-amber-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {status === 'sending' ? UI.sending[locale] : UI.submit[locale]}
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
