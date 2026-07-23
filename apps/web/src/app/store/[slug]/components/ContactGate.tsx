'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Store, MapPin, Loader2 } from 'lucide-react'
import type { RetailerProfile } from '../page'

interface Props {
  slug: string
  profile: RetailerProfile
}

type Gender = 'MALE' | 'FEMALE'

const leadKey = (slug: string) => `kanchuki_lead_${slug}`

export function ContactGate({ slug, profile }: Props) {
  const router = useRouter()
  const [checkingReturningVisitor, setCheckingReturningVisitor] = useState(true)
  const [noStorefrontYet, setNoStorefrontYet] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already submitted details for this store before — skip the form and
  // go straight to the catalog instead of asking again.
  useEffect(() => {
    const alreadySubmitted = localStorage.getItem(leadKey(slug))
    if (alreadySubmitted) {
      if (profile.storefront_slug) {
        router.replace(`/c/${profile.storefront_slug}`)
        return
      }
      setNoStorefrontYet(true)
    }
    setCheckingReturningVisitor(false)
  }, [slug, profile.storefront_slug, router])

  const canSubmit = name.trim().length > 0 && phone.trim().length >= 10 && gender !== null && consent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/${slug}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), gender, consent }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } }
        throw new Error(json.error?.message ?? 'Could not submit your details')
      }
      localStorage.setItem(leadKey(slug), '1')
      // Replace (not push) so the back button never lands back on this form —
      // it skips straight past this history entry to the catalog.
      if (profile.storefront_slug) {
        router.replace(`/c/${profile.storefront_slug}`)
      } else {
        setNoStorefrontYet(true)
        setSubmitting(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (checkingReturningVisitor) {
    return (
      <div className="min-h-screen bg-cyan-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-cyan-600" />
      </div>
    )
  }

  // No catalog to redirect to yet (retailer hasn't published a storefront) —
  // nothing to auto-open, so just say so.
  if (noStorefrontYet) {
    return (
      <div className="min-h-screen bg-cyan-50 flex flex-col items-center justify-center px-6 gap-6 relative">
        <Link
          href="/"
          className="absolute top-4 left-4 text-sm text-cyan-700/70 hover:text-cyan-700 flex items-center gap-1"
        >
          ← Back
        </Link>
        <div className="bg-white rounded-3xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-cyan-100 rounded-full items-center justify-center flex mx-auto mb-4">
            <Store size={26} className="text-cyan-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{profile.shop_name}</h1>
          {(profile.city || profile.address_line1) && (
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
              <MapPin size={14} />
              {[profile.address_line1, profile.city, profile.state].filter(Boolean).join(', ')}
            </p>
          )}
          <p className="mt-6 text-sm text-gray-400">Catalog coming soon.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyan-50 flex flex-col items-center justify-center px-6 relative">
      <Link
        href="/"
        className="absolute top-4 left-4 text-sm text-cyan-700/70 hover:text-cyan-700 flex items-center gap-1"
      >
        ← Back
      </Link>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-white rounded-3xl border border-gray-100 p-6 max-w-sm w-full"
      >
        <h1 className="text-lg font-bold text-gray-900 mb-1">{profile.shop_name}</h1>
        <p className="text-xs text-gray-500 mb-5">
          Share your details to view this store&apos;s catalog.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-cyan-400"
          placeholder="Your name"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Phone
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          type="tel"
          minLength={10}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-cyan-400"
          placeholder="10-digit mobile number"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Gender
        </label>
        <div className="flex gap-3 mb-4">
          {(['MALE', 'FEMALE'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium border ${
                gender === g ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {g === 'MALE' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>

        <label className="flex items-start gap-2 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5"
          />
          <span className="text-xs text-gray-500">
            I agree to share my details with {profile.shop_name} and be contacted about products.
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full bg-cyan-600 disabled:bg-gray-300 text-white font-semibold text-sm py-3 rounded-2xl flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Continue'}
        </button>
      </form>
    </div>
  )
}
