// Task 18: /my-profile — Shopper profile page.
//
// Shows: name, phone (masked), city, usual size, style chips (editable),
// saved items, recently viewed, enquiries/orders, notification toggles,
// data controls (export, delete, personalization toggle).

'use client'

import { useEffect, useState } from 'react'
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

const STYLE_CHIPS = [
  'Casual', 'Party', 'Office', 'Wedding', 'Festive',
  'Anarkali', 'Lehenga', 'Saree', 'Kurti', 'Gown',
  'Indo-Western', 'Sharara', 'Suit', 'Gown',
]

export default function MyProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
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
  }, [])

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
      // Nominee lives on the preferences endpoint (not in /me).
      const prefRes = await fetch('/api/passport/preferences', { credentials: 'include' })
      if (prefRes.ok) {
        const prefs = await prefRes.json()
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

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-24 bg-stone-200 rounded-lg" />
        <div className="h-32 bg-stone-200 rounded-lg" />
        <div className="h-48 bg-stone-200 rounded-lg" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">Please log in to view your profile.</p>
      </div>
    )
  }

  const { account, recently_viewed } = profile

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-2xl font-bold text-amber-700">
            {(account.name ?? account.phone_masked.slice(-1) ?? '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {account.name ?? 'Shopper'}
            </h1>
            <p className="text-sm text-stone-500">{account.phone_masked}</p>
            {account.city && (
              <p className="text-sm text-stone-400">{account.city}</p>
            )}
          </div>
        </div>
      </section>

      {/* Style chips */}
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <h2 className="text-lg font-medium text-stone-900 mb-3">Your Style</h2>
        <p className="text-sm text-stone-500 mb-4">
          Tap to select styles you love — we&apos;ll use this to personalize your feed.
        </p>
        <div className="flex flex-wrap gap-2">
          {STYLE_CHIPS.map((style) => (
            <button
              key={style}
              onClick={() => toggleStyle(style)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedStyles.includes(style)
                  ? 'bg-amber-600 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
        {selectedStyles.length > 0 && (
          <button
            onClick={savePreferences}
            disabled={saving}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        )}
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-stone-200 p-4 text-center">
          <p className="text-2xl font-bold text-stone-900">{recently_viewed.length}</p>
          <p className="text-xs text-stone-500">Viewed</p>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 p-4 text-center">
          <p className="text-2xl font-bold text-stone-900">{profile.wishlist_count}</p>
          <p className="text-xs text-stone-500">Saved</p>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 p-4 text-center">
          <p className="text-2xl font-bold text-stone-900">{profile.enquiry_count}</p>
          <p className="text-xs text-stone-500">Enquiries</p>
        </div>
      </section>

      {/* Recently Viewed */}
      {recently_viewed.length > 0 && (
        <section className="bg-white rounded-lg border border-stone-200 p-6">
          <h2 className="text-lg font-medium text-stone-900 mb-3">Recently Viewed</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recently_viewed.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-32">
                <div className="w-32 h-32 bg-stone-100 rounded-lg overflow-hidden">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- below-the-fold thumbnail row, no LCP benefit from next/image
                    <img
                      src={item.photo_url}
                      alt={item.name ?? 'Product'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">
                      No photo
                    </div>
                  )}
                </div>
                <p className="text-xs text-stone-700 mt-1 truncate">{item.name}</p>
                <p className="text-xs text-stone-400 truncate">{item.retailer.shop_name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notification toggles */}
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <h2 className="text-lg font-medium text-stone-900 mb-3">Notifications</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm text-stone-700">WhatsApp messages from stores</span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="h-4 w-4 text-amber-600 rounded"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-stone-700">Personalized recommendations</span>
            <input
              type="checkbox"
              checked={personalizationEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked
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
              }}
              className="h-4 w-4 text-amber-600 rounded"
            />
          </label>
        </div>
      </section>

      {/* Right to nominate — DPDP Act s.14 */}
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <h2 className="text-lg font-medium text-stone-900 mb-1">Nominee</h2>
        <p className="text-sm text-stone-500 mb-4">
          Name someone who can exercise your data rights if you die or can no longer do so
          yourself.
        </p>
        <div className="space-y-3">
          <input
            type="text"
            value={nomineeName}
            onChange={(e) => setNomineeName(e.target.value)}
            placeholder="Nominee's full name"
            maxLength={100}
            aria-label="Nominee's full name"
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm"
          />
          <input
            type="tel"
            inputMode="numeric"
            value={nomineePhone}
            onChange={(e) => setNomineePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Nominee's 10-digit mobile number"
            aria-label="Nominee's mobile number"
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveNominee(false)}
              disabled={nomineeBusy || !nomineeName.trim() || nomineePhone.length !== 10}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {nomineeBusy ? 'Saving…' : nomineeSaved ? 'Update nominee' : 'Save nominee'}
            </button>
            {nomineeSaved && (
              <button
                onClick={() => saveNominee(true)}
                disabled={nomineeBusy}
                className="px-4 py-2 bg-stone-100 text-stone-600 rounded-lg text-sm font-medium hover:bg-stone-200 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Data controls */}
      <section className="bg-white rounded-lg border border-stone-200 p-6">
        <h2 className="text-lg font-medium text-stone-900 mb-3">Your Data</h2>
        <div className="space-y-3">
          <button
            onClick={async () => {
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
            }}
            disabled={exporting}
            className="w-full text-left px-4 py-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors text-sm text-stone-700 disabled:opacity-50"
          >
            {exporting ? '⏳ Exporting...' : '📥 Download my data'}
          </button>
          <button
            onClick={async () => {
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
            }}
            disabled={deleting}
            className="w-full text-left px-4 py-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-sm text-red-600 disabled:opacity-50"
          >
            {deleting ? '⏳ Deleting...' : '🗑️ Delete my account'}
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-3">
          Under the Digital Personal Data Protection Act, 2023, you can request a
          copy of all data we hold about you, or ask us to delete it.
        </p>
      </section>
    </div>
  )
}
