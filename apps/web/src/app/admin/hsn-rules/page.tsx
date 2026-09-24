'use client'

import { useState, useEffect } from 'react'
import { Receipt, Save, Loader2, Plus } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// §6.11 — keyword → HSN rules for WhatsApp catalog items. First active rule
// (by sort order) with a keyword found in the product's name/category/
// subtype/description wins; no hit → 6204. Rules are disabled, never deleted.
type HsnRule = { id: string; keywords: string[]; hsn: string; sort_order: number; is_active: boolean }
type Draft = { keywords: string; hsn: string; sort_order: string; is_active: boolean }

const toDraft = (r: HsnRule): Draft => ({
  keywords: r.keywords.join(', '),
  hsn: r.hsn,
  sort_order: String(r.sort_order),
  is_active: r.is_active,
})
const toBody = (d: Draft) => ({
  keywords: d.keywords.split(',').map((k) => k.trim()).filter(Boolean),
  hsn: d.hsn.trim(),
  sort_order: Number(d.sort_order) || 0,
  is_active: d.is_active,
})

async function apiError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null)
  return json?.error?.message ?? json?.message ?? `Request failed (${res.status})`
}

export default function HsnRulesPage() {
  const [rules, setRules] = useState<HsnRule[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [draftNew, setDraftNew] = useState<Draft>({ keywords: '', hsn: '', sort_order: '', is_active: true })

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/hsn-rules`, adminGetOptions())
      if (!res.ok) throw new Error(await apiError(res))
      const data: HsnRule[] = (await res.json()).data ?? []
      setRules(data)
      setDrafts(Object.fromEntries(data.map((r) => [r.id, toDraft(r)])))
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Failed to load HSN rules'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const send = async (key: string, url: string, method: 'POST' | 'PATCH', draft: Draft, ok: string) => {
    setSaving(key)
    setStatus('')
    try {
      const res = await fetch(url, { ...(await adminMutateOptions()), method, body: JSON.stringify(toBody(draft)) })
      if (!res.ok) throw new Error(await apiError(res))
      setStatus(`✅ ${ok} — applies from the next catalog sync`)
      await load()
      return true
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
      return false
    } finally {
      setSaving(null)
    }
  }

  const patch = (id: string, p: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] as Draft), ...p } }))

  const nextSort = String((rules.at(-1)?.sort_order ?? 0) + 10)
  const input = 'px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-2">
        <Receipt className="text-indigo-600" size={24} />
        <h1 className="text-2xl font-bold text-gray-900">HSN Rules</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Keyword → HSN code for WhatsApp catalog items. Checked top to bottom (lowest sort order first); the first
        active rule with a keyword in the product&apos;s name, category, subtype or description wins. No match → 6204.
      </p>

      {status && <p className="mb-4 text-sm">{status}</p>}

      {loading ? (
        <Loader2 className="animate-spin text-gray-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 w-20">Order</th>
                <th className="px-3 py-2">Keywords (comma-separated)</th>
                <th className="px-3 py-2 w-32">HSN</th>
                <th className="px-3 py-2 w-20">Active</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    No rules — the built-in default list is in use.
                  </td>
                </tr>
              )}
              {rules.map((r) => {
                const d = drafts[r.id] ?? toDraft(r)
                return (
                  <tr key={r.id} className={`border-t border-gray-100 ${d.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-2">
                      <input aria-label="Sort order" className={`${input} w-16`} value={d.sort_order} onChange={(e) => patch(r.id, { sort_order: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label="Keywords" className={`${input} w-full`} value={d.keywords} onChange={(e) => patch(r.id, { keywords: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label="HSN code" className={`${input} w-28`} value={d.hsn} onChange={(e) => patch(r.id, { hsn: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label="Active" type="checkbox" checked={d.is_active} onChange={(e) => patch(r.id, { is_active: e.target.checked })} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={saving !== null}
                        onClick={() => send(r.id, `${API_URL}/v1/admin/hsn-rules/${r.id}`, 'PATCH', d, 'Rule saved')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {saving === r.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                      </button>
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t border-gray-200 bg-gray-50/50">
                <td className="px-3 py-2">
                  <input aria-label="New rule sort order" className={`${input} w-16`} placeholder={nextSort} value={draftNew.sort_order} onChange={(e) => setDraftNew({ ...draftNew, sort_order: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <input aria-label="New rule keywords" className={`${input} w-full`} placeholder="kaftan, tunic" value={draftNew.keywords} onChange={(e) => setDraftNew({ ...draftNew, keywords: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <input aria-label="New rule HSN code" className={`${input} w-28`} placeholder="6211" value={draftNew.hsn} onChange={(e) => setDraftNew({ ...draftNew, hsn: e.target.value })} />
                </td>
                <td />
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={saving !== null}
                    onClick={async () => {
                      const d = { ...draftNew, sort_order: draftNew.sort_order || nextSort }
                      if (await send('new', `${API_URL}/v1/admin/hsn-rules`, 'POST', d, 'Rule added')) {
                        setDraftNew({ keywords: '', hsn: '', sort_order: '', is_active: true })
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {saving === 'new' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
