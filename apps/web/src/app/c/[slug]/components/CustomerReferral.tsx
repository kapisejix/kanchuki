'use client'

import { useState, useCallback } from 'react'
import { Gift, Share2, Copy, Check, Phone, Loader2 } from 'lucide-react'
import { ConsentCheckbox } from '@/components/ConsentCheckbox'

interface ReferralData {
  code: string
  reward_paise: number
}

interface CreditsData {
  total_paise: number
  credits: Array<{
    id: string
    amount_paise: number
    status: string
    created_at: string
  }>
}

interface Props {
  storeSlug: string
  storeName: string
}

export function CustomerReferral({ storeSlug, storeName }: Props) {
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [referral, setReferral] = useState<ReferralData | null>(null)
  const [credits, setCredits] = useState<CreditsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<'phone' | 'referral'>('phone')

  const handleGetCode = useCallback(async () => {
    if (phone.trim().length < 10 || !consent) return
    setLoading(true)
    setError(null)

    try {
      // First, ensure the customer exists via the leads endpoint
      const leadRes = await fetch(`/api/${storeSlug}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Customer',
          phone: phone.trim(),
          gender: 'FEMALE',
          consent,
        }),
      })
      if (!leadRes.ok) throw new Error('Could not verify your phone')

      // Get or create referral code
      // Use the public referral endpoint with a dummy code to check
      // For now, generate a simple code from the phone
      const code = `K${phone.trim().slice(-6)}`
      const rewardPaise = 5000 // ₹50 default reward

      setReferral({ code, reward_paise: rewardPaise })
      setStep('referral')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [phone, consent, storeSlug])

  const handleShare = useCallback(() => {
    if (!referral) return
    const shareUrl = `${window.location.origin}/r/${referral.code}`
    const message = `Join ${storeName} on Kanchuki! Use my referral code ${referral.code} and get ₹${(referral.reward_paise / 100).toFixed(0)} off your first order. ${shareUrl}`
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }, [referral, storeName])

  const handleCopy = useCallback(async () => {
    if (!referral) return
    await navigator.clipboard.writeText(referral.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [referral])

  return (
    <section className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Gift size={16} className="text-purple-500" />
        <h3 className="text-sm font-bold text-gray-900">Refer & Earn</h3>
      </div>
      <p className="text-[10px] text-gray-500 mb-3">
        Share {storeName} with friends — you both get rewards!
      </p>

      {step === 'phone' && (
        <>
          <div className="flex gap-2 mb-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number"
              className="flex-1 text-sm border border-purple-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-purple-400"
              minLength={10}
            />
            <button
              onClick={() => void handleGetCode()}
              disabled={phone.trim().length < 10 || !consent || loading}
              className="bg-purple-600 disabled:bg-purple-300 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1 transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />}
              Get Code
            </button>
          </div>
          <ConsentCheckbox checked={consent} onChange={setConsent} className="mb-2" />
          {error && <p className="text-[10px] text-red-500">{error}</p>}
        </>
      )}

      {step === 'referral' && referral && (
        <div className="space-y-2">
          <div className="bg-white rounded-xl p-3 border border-purple-100">
            <p className="text-[10px] text-gray-500 mb-1">Your referral code</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-mono font-bold text-purple-700">{referral.code}</span>
              <button
                onClick={() => void handleCopy()}
                className="ml-auto text-purple-400 hover:text-purple-600 transition-colors"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Friend gets ₹{(referral.reward_paise / 100).toFixed(0)} off, you get ₹{(referral.reward_paise / 100).toFixed(0)} credit
            </p>
          </div>
          <button
            onClick={handleShare}
            className="w-full bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Share2 size={14} />
            Share via WhatsApp
          </button>
        </div>
      )}
    </section>
  )
}
