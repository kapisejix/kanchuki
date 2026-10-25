// Task 18: /my-profile — Shopper profile page.
//
// Shows: name, phone (masked), city, usual size, style chips (editable),
// saved items, recently viewed, enquiries/orders,
// data controls (export, delete, personalization toggle).

'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Check, ChevronRight, Database, Download, Eye, Heart, Loader2, MapPin,
  MessageCircle, Phone, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { getPassportSession, type PassportAccount } from '@/lib/passport-client'

interface ProfileData {
  account: PassportAccount
  recently_viewed: Array<{
    id: string
    name: string | null
    category: string | null
    primary_color: string | null
    photo_url: string | null
    viewed_at: string
    retailer: { shop_name: string }
  }>
  wishlist_count: number
  enquiry_count: number
}

// Fallback only — the live list comes from
// `GET /v1/public/attributes?kind=STYLE` (Admin → Default Attributes), so a
// style change no longer needs a web deploy. This copy is what we show when
// that fetch fails or when the admin has configured nothing yet; unlike the
// hardcoded list it replaces, it has no duplicate (the old one carried 'Gown'
// twice — the drift a single source of truth avoids).
const FALLBACK_STYLE_CHIPS = [
  'Casual', 'Party', 'Office', 'Wedding', 'Festive',
  'Anarkali', 'Lehenga', 'Saree', 'Kurti', 'Gown',
  'Indo-Western', 'Sharara', 'Suit',
]

export default function MyProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [styleOptions, setStyleOptions] = useState<string[]>([])
  const [stylesStatus, setStylesStatus] = useState<'loading' | 'ready'>('loading')
  const [stylesNotice, setStylesNotice] = useState<string | null>(null)
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [nomineeName, setNomineeName] = useState('')
  const [nomineePhone, setNomineePhone] = useState('')
  const [nomineeSaved, setNomineeSaved] = useState(false)
  const [nomineeBusy, setNomineeBusy] = useState(false)

  useEffect(() => {
    loadProfile()
    loadStyles()
  }, [])

  // Style chips come from the admin-editable taxonomy. Fail open in every
  // direction: a taxonomy outage must not empty the picker, and the real error
  // is surfaced rather than swallowed (RC-003).
  async function loadStyles() {
    setStylesStatus('loading')
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    try {
      const res = await fetch(`${apiUrl}/v1/public/attributes?kind=STYLE`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      const names: string[] = json?.data?.names ?? []
      if (names.length === 0) {
        setStyleOptions(FALLBACK_STYLE_CHIPS)
        setStylesNotice(
          'No styles are configured in the admin panel yet — showing a built-in list.',
        )
      } else {
        setStyleOptions(names)
        setStylesNotice(null)
      }
    } catch (err) {
      setStyleOptions(FALLBACK_STYLE_CHIPS)
      setStylesNotice(
        `Couldn't load the latest styles (${(err as Error).message}) — showing a built-in list.`,
      )
    } finally {
      setStylesStatus('ready')
    }
  }

  async function loadProfile() {
    try {
      const account = await getPassportSession()
      if (!account) return

      // Fetch recently viewed
      const rvRes = await fetch('/api/passport/recently-viewed?limit=10', {
        credentials: 'include',
      })
      const rvData = rvRes.ok ? await rvRes.json() : { items: [] }

      setProfile({
        account,
        recently_viewed: rvData.items ?? [],
        wishlist_count: 0, // TODO: fetch from wishlist endpoint
        enquiry_count: 0, // TODO: fetch from enquiries
      })
      // Initialize style chips from account preferences
      setSelectedStyles((account as any).pref_styles ?? [])
      // Nominee and the profiling opt-out live on the preferences endpoint
      // (not in /me). Without loading profiling_enabled an opted-out shopper
      // saw the box ticked again on every visit (RC-083).
      const prefRes = await fetch('/api/passport/preferences', { credentials: 'include' })
      if (prefRes.ok) {
        const prefs = await prefRes.json()
        setPersonalizationEnabled(prefs.profiling_enabled !== false)
        setNomineeName(prefs.nominee_name ?? '')
        setNomineePhone(prefs.nominee_phone ?? '')
        setNomineeSaved(Boolean(prefs.nominee_name))
      }
    } catch {
      // Session expired or network error
    } finally {
      setLoading(false)
    }
  }

  function toggleStyle(style: string) {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style],
    )
  }

  async function savePreferences() {
    setSaving(true)
    try {
      // TODO: wire to PUT /passport/preferences endpoint
      await new Promise((r) => setTimeout(r, 500)) // placeholder
    } finally {
      setSaving(false)
    }
  }

  // A non-2xx resolves rather than throws, so check res.ok (RC-026's lesson).
  async function saveNominee(clear: boolean) {
    setNomineeBusy(true)
    try {
      const res = await fetch('/api/passport/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          clear
            ? { nominee_name: null, nominee_phone: null }
            : { nominee_name: nomineeName.trim(), nominee_phone: nomineePhone.trim() },
        ),
      })
      if (!res.ok) throw new Error(`nominee update failed: ${res.status}`)
      if (clear) {
        setNomineeName('')
        setNomineePhone('')
      }
      setNomineeSaved(!clear)
    } catch {
      alert('Could not save your nominee. Check the 10-digit mobile number and try again.')
    } finally {
      setNomineeBusy(false)
    }
  }

  async function togglePersonalization(enabled: boolean) {
    setPersonalizationEnabled(enabled)
    try {
      const res = await fetch('/api/passport/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiling_enabled: enabled }),
      })
      // A non-2xx resolves rather than throwing, so without this a
      // 405 from a missing proxy verb (RC-026) or an expired
      // session looked identical to a saved preference — the box
      // stayed off and silently reverted on reload.
      if (!res.ok) throw new Error(`preferences update failed: ${res.status}`)
    } catch {
      setPersonalizationEnabled(!enabled)
      alert('Could not save your preference. Please try again.')
    }
  }

  async function exportData() {
    setExporting(true)
    try {
      const res = await fetch('/api/passport/export')
      if (res.status === 429) {
        alert('You can only export your data once per day.')
        return
      }
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kanchuki-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to export data. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/passport/delete', { method: 'POST' })
      if (!res.ok) throw new Error('Delete failed')
      window.location.href = '/'
    } catch (err) {
      alert('Failed to delete account. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse motion-reduce:animate-none space-y-4" aria-busy="true">
        <div className="h-40 bg-lavender-100 rounded-3xl" />
        <div className="h-44 bg-lavender-100 rounded-3xl" />
        <div className="h-28 bg-lavender-100 rounded-3xl" />
        <div className="h-48 bg-lavender-100 rounded-3xl" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="bg-white rounded-3xl border border-lavender-200 px-6 py-12 text-center">
        <UserRound aria-hidden className="h-10 w-10 mx-auto text-heliotrope-400 mb-3" />
        <p className="text-heliotrope-500">Please log in to view your profile.</p>
      </div>
    )
  }

  const { account, recently_viewed } = profile
  const stats = [
    { label: 'Viewed', value: recently_viewed.length, icon: Eye },
    { label: 'Saved', value: profile.wishlist_count, icon: Heart },
    { label: 'Enquiries', value: profile.enquiry_count, icon: MessageCircle },
  ]

  return (
    <motion.div variants={LIST} initial="hidden" animate="show" className="space-y-4">
      {/* Account */}
      <motion.section variants={ITEM} className={`${CARD} overflow-hidden`}>
        <div className="h-16 bg-gradient-to-r from-spaceCadet-900 to-tyrian-800" />
        <div className="px-5 pb-5 -mt-8">
          <div>
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-white p-1 shadow-lg shadow-spaceCadet-900/15">
              <div className="w-full h-full rounded-xl bg-fuchsia-500/15 flex items-center justify-center text-2xl font-bold text-fuchsia-700">
                {(account.name ?? account.phone_masked.slice(-1) ?? '?').charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="min-w-0 mt-3">
              <h1 className="text-xl font-bold text-spaceCadet-900 truncate">
                {account.name ?? 'Shopper'}
              </h1>
              <p className="text-sm text-heliotrope-500 flex flex-wrap items-center gap-x-3">
                <span className="inline-flex items-center gap-1">
                  <Phone aria-hidden className="h-3.5 w-3.5" />
                  {account.phone_masked}
                </span>
                {account.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="h-3.5 w-3.5" />
                    {account.city}
                  </span>
                )}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 mt-5">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col-reverse rounded-2xl bg-lavender-50 border border-lavender-100 px-2 py-3 text-center">
                <dt className="text-xs text-heliotrope-500">{label}</dt>
                <dd className="text-xl font-bold text-spaceCadet-900 tabular-nums">{value}</dd>
                <Icon aria-hidden className="h-4 w-4 mx-auto text-heliotrope-400 mb-1" />
              </div>
            ))}
          </dl>
        </div>
      </motion.section>

      {/* Style chips */}
      <Section
        icon={Sparkles}
        title="Your Style"
        description="Tap the styles you love — we'll use them to personalize your feed."
      >
        {stylesStatus === 'loading' ? (
          <div className="flex flex-wrap gap-2" aria-label="Loading styles…">
            {[72, 56, 64, 80, 60, 68].map((w) => (
              <div
                key={w}
                className="h-11 rounded-full bg-lavender-100 animate-pulse motion-reduce:animate-none"
                style={{ width: w }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {styleOptions.map((style) => {
              const on = selectedStyles.includes(style)
              return (
                <motion.button
                  key={style}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggleStyle(style)}
                  aria-pressed={on}
                  className={`min-h-11 px-4 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50 ${
                    on
                      ? 'bg-spaceCadet-900 border-spaceCadet-900 text-white'
                      : 'bg-white border-lavender-200 text-spaceCadet-900 hover:border-heliotrope-400'
                  }`}
                >
                  {on && <Check aria-hidden className="h-3.5 w-3.5 text-fuchsia-400" />}
                  {style}
                </motion.button>
              )
            })}
          </div>
        )}
        {stylesNotice && <p className="mt-3 text-xs text-heliotrope-500">{stylesNotice}</p>}
        {selectedStyles.length > 0 && (
          <button onClick={savePreferences} disabled={saving} className={`${BTN_PRIMARY} mt-4`}>
            {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        )}
      </Section>

      {/* Recently Viewed */}
      <Section icon={Eye} title="Recently Viewed">
        {recently_viewed.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 snap-x">
            {recently_viewed.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-28 snap-start">
                <div className="w-28 h-36 bg-lavender-50 rounded-2xl overflow-hidden border border-lavender-100">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- below-the-fold thumbnail row, no LCP benefit from next/image
                    <img
                      src={item.photo_url}
                      alt={item.name ?? 'Product'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-heliotrope-400 text-xs">
                      No photo
                    </div>
                  )}
                </div>
                <p className="text-xs font-semibold text-spaceCadet-900 mt-1.5 truncate">{item.name}</p>
                <p className="text-xs text-heliotrope-500 truncate">{item.retailer.shop_name}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-heliotrope-500 rounded-2xl bg-lavender-50 border border-dashed border-lavender-200 px-4 py-6 text-center">
            Products you open in any store will show up here.
          </p>
        )}
      </Section>

      {/* Personalization. The "WhatsApp messages from stores" box was removed
          (RC-083): it was never loaded or saved and nothing sends store
          WhatsApp to shoppers. Re-add it with a real setting alongside F-035. */}
      <Section icon={SlidersHorizontal} title="Personalization">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p id="perso-label" className="text-sm font-semibold text-spaceCadet-900">
              Personalized recommendations
            </p>
            <p id="perso-desc" className="text-xs text-heliotrope-500 mt-0.5">
              Use your views and saved styles to rank what you see.
            </p>
          </div>
          {/* Switch look over a real checkbox: the input fills the hit area at
              opacity 0, so it keeps checkbox semantics, keyboard and the e2e
              uncheck() — only the paint is custom. */}
          <span className="relative inline-flex shrink-0 h-11 w-14 items-center justify-center">
            <input
              type="checkbox"
              checked={personalizationEnabled}
              onChange={(e) => togglePersonalization(e.target.checked)}
              aria-labelledby="perso-label"
              aria-describedby="perso-desc"
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <span className="h-7 w-12 rounded-full bg-lavender-200 transition-colors peer-checked:bg-fuchsia-600 peer-focus-visible:ring-2 peer-focus-visible:ring-fuchsia-500/50 peer-focus-visible:ring-offset-2" />
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none peer-checked:translate-x-5" />
          </span>
        </div>
      </Section>

      {/* Right to nominate — DPDP Act s.14 */}
      <Section
        icon={ShieldCheck}
        title="Nominee"
        description="Name someone who can exercise your data rights if you die or can no longer do so yourself."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={nomineeName}
            onChange={(e) => setNomineeName(e.target.value)}
            placeholder="Nominee's full name"
            maxLength={100}
            aria-label="Nominee's full name"
            className={INPUT}
          />
          <input
            type="tel"
            inputMode="numeric"
            value={nomineePhone}
            onChange={(e) => setNomineePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Nominee's 10-digit mobile number"
            aria-label="Nominee's mobile number"
            className={INPUT}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => saveNominee(false)}
              disabled={nomineeBusy || !nomineeName.trim() || nomineePhone.length !== 10}
              className={BTN_PRIMARY}
            >
              {nomineeBusy && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {nomineeBusy ? 'Saving…' : nomineeSaved ? 'Update nominee' : 'Save nominee'}
            </button>
            {nomineeSaved && (
              <button onClick={() => saveNominee(true)} disabled={nomineeBusy} className={BTN_SECONDARY}>
                Remove
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Data controls */}
      <Section
        icon={Database}
        title="Your Data"
        description="Under the Digital Personal Data Protection Act, 2023, you can request a copy of all data we hold about you, or ask us to delete it."
      >
        <button onClick={exportData} disabled={exporting} className={ROW_BTN}>
          {exporting ? (
            <Loader2 aria-hidden className="h-5 w-5 text-heliotrope-500 animate-spin motion-reduce:animate-none" />
          ) : (
            <Download aria-hidden className="h-5 w-5 text-heliotrope-500" />
          )}
          <span className="flex-1">{exporting ? 'Exporting…' : 'Download my data'}</span>
          <ChevronRight aria-hidden className="h-4 w-4 text-heliotrope-400" />
        </button>
      </Section>

      {/* Danger zone */}
      <motion.section variants={ITEM} className="bg-white rounded-3xl border border-red-200 p-5">
        <h2 className="text-base font-bold text-red-700 flex items-center gap-2 mb-1">
          <AlertTriangle aria-hidden className="h-4 w-4" />
          Danger zone
        </h2>
        <p className="text-sm text-heliotrope-500 mb-4">
          Deleting your account removes your profile, saved styles and history. This cannot be undone.
        </p>
        <button
          onClick={deleteAccount}
          disabled={deleting}
          className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg shadow-red-600/20 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2"
        >
          {deleting ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 aria-hidden className="h-4 w-4" />
          )}
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </motion.section>
    </motion.div>
  )
}

// ─── Royal Orchid building blocks (same look as the retailer mobile app) ───

const CARD = 'bg-white rounded-3xl border border-lavender-200 shadow-sm shadow-spaceCadet-900/5'
const BTN_PRIMARY =
  'min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-spaceCadet-900 to-tyrian-800 text-white text-sm font-semibold shadow-lg shadow-spaceCadet-900/25 transition-opacity hover:opacity-95 disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50 focus-visible:ring-offset-2'
const BTN_SECONDARY =
  'min-h-11 px-5 inline-flex items-center justify-center rounded-2xl bg-white border border-lavender-200 text-spaceCadet-900 text-sm font-semibold shadow-sm hover:bg-lavender-50 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50'
const INPUT =
  'w-full min-h-11 px-3.5 rounded-xl border border-lavender-200 bg-white text-base sm:text-sm text-spaceCadet-900 placeholder:text-heliotrope-400 focus:outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30'
const ROW_BTN =
  'w-full min-h-12 px-4 flex items-center gap-3 text-left rounded-2xl bg-lavender-50 border border-lavender-100 hover:bg-lavender-100 text-sm font-semibold text-spaceCadet-900 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50'

const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <motion.section variants={ITEM} className={`${CARD} p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-lavender-100 flex items-center justify-center">
          <Icon aria-hidden className="h-[18px] w-[18px] text-heliotrope-600" />
        </span>
        <div className="min-w-0 pt-1.5">
          <h2 className="text-base font-bold text-spaceCadet-900">{title}</h2>
          {description && <p className="text-sm text-heliotrope-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  )
}
