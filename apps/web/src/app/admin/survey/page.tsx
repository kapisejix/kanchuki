'use client'

// Grid + detail view of retailer survey submissions
// (GET /v1/admin/survey-submissions → RetailerSurvey AuditLog entries,
// apps/api/src/routes/admin/admin-survey.ts). List already returns full
// metadata, so the row-click detail panel renders from the same payload —
// no second fetch/route. Field labels reused from the public form's
// translations (English) so the two can't drift apart.
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ClipboardList, RefreshCw, ArrowLeft, ArrowRight, X, Phone, Clock, Monitor } from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'
import { SECTIONS, type Question } from '../../survey/translations'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type SurveySubmission = {
  id: string
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
  submitted_by: string | null
}

function optionLabel(q: Question, value: string): string {
  return q.options?.find((o) => o.value === value)?.label.en ?? value
}

function fieldDisplay(q: Question, raw: unknown): string {
  if (raw == null || raw === '') return '—'
  if (Array.isArray(raw)) return raw.map((v) => optionLabel(q, String(v))).join(', ')
  if (q.type === 'radio' || q.type === 'select') return optionLabel(q, String(raw))
  if (q.type === 'likert') return `${raw} / 5`
  return String(raw)
}

const LOCALE_LABEL: Record<string, string> = { en: 'English', hi: 'Hindi', pa: 'Punjabi' }

export default function SurveySubmissionsPage() {
  const [rows, setRows] = useState<SurveySubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [selected, setSelected] = useState<SurveySubmission | null>(null)

  const load = useCallback(async (cursorVal?: string, pushStack = false) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '25' })
      if (cursorVal) params.set('cursor', cursorVal)
      const res = await fetch(`${API_URL}/v1/admin/survey-submissions?${params}`, adminGetOptions())
      const json = await res.json()
      if (!res.ok || !Array.isArray(json?.data)) {
        setError(`Failed to load submissions (${res.status})`)
        return
      }
      setRows(json.data)
      setHasMore(json.pagination?.has_more ?? false)
      setCursor(json.pagination?.cursor ?? null)
      setTotal(json.pagination?.total ?? 0)
      if (pushStack && cursorVal) setCursorStack((prev) => [...prev, cursorVal])
    } catch {
      setError('Network error — could not load submissions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleNext = () => cursor && load(cursor, true)
  const handlePrev = () => {
    const prev = cursorStack[cursorStack.length - 1]
    if (prev) {
      setCursorStack((s) => s.slice(0, -1))
      load(prev)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/20">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Survey Submissions</h1>
            <p className="text-sm text-gray-500">Retailer discovery survey — newest first</p>
          </div>
        </div>
        <button
          onClick={() => load(cursor ?? undefined)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="text-center py-20 bg-white/80 rounded-2xl border border-gray-200/80">
          <ClipboardList size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No survey submissions yet</p>
          <p className="text-xs text-gray-400 mt-1">Submissions from kanchuki.app/survey appear here.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-white/80 rounded-2xl border border-gray-200/80 overflow-hidden">
          <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">{total} submission{total === 1 ? '' : 's'}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-4 py-2">Store</th>
                  <th className="px-4 py-2">Owner</th>
                  <th className="px-4 py-2">City</th>
                  <th className="px-4 py-2">Lang</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Staff</th>
                  <th className="px-4 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-b border-gray-50 last:border-0 hover:bg-amber-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{String(r.metadata.storeName ?? '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{String(r.metadata.ownerName ?? '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{String(r.metadata.city ?? '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{LOCALE_LABEL[String(r.metadata.locale ?? 'en')] ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{String(r.metadata.contactPhone ?? '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{r.submitted_by ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(cursorStack.length > 0 || hasMore) && !loading && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={handlePrev} disabled={cursorStack.length === 0} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40">
            <ArrowLeft size={14} /> Previous
          </button>
          <span className="text-xs text-gray-400 font-mono">Page {cursorStack.length + 1}</span>
          <button onClick={handleNext} disabled={!hasMore} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40">
            Next <ArrowRight size={14} />
          </button>
        </div>
      )}

      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-lg h-full bg-white overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{String(selected.metadata.storeName ?? 'Untitled store')}</h2>
                <p className="text-xs text-gray-400 flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1"><Clock size={11} />{new Date(selected.created_at).toLocaleString('en-IN')}</span>
                  {selected.ip_address && <span className="flex items-center gap-1"><Monitor size={11} />{selected.ip_address}</span>}
                  <span>{LOCALE_LABEL[String(selected.metadata.locale ?? 'en')] ?? 'English'}</span>
                  {selected.submitted_by && <span>Staff: {selected.submitted_by}</span>}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {selected.metadata.contactPhone ? (
              <a
                href={`tel:${String(selected.metadata.contactPhone)}`}
                className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 mb-5"
              >
                <Phone size={14} /> {String(selected.metadata.contactPhone)}
                {selected.metadata.contactTime ? ` — ${String(selected.metadata.contactTime)}` : ''}
              </a>
            ) : null}

            <div className="space-y-5">
              {SECTIONS.map((section) => (
                <div key={section.title.en}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{section.title.en}</h3>
                  <div className="space-y-2 bg-gray-50 rounded-xl border border-gray-100 p-3">
                    {section.questions.map((q) => (
                      <div key={q.name} className="text-sm">
                        <span className="text-gray-500">{q.label.en}: </span>
                        <span className="text-gray-900 font-medium">{fieldDisplay(q, selected.metadata[q.name])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
