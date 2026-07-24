'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, CreditCard, Loader2, MapPin, Phone, User } from 'lucide-react'
import { formatPriceRange } from '@kanchuki/shared'
import { type CartMap, loadCart, cartTotal, saveCart } from '../lib/cart'

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: { name: string; contact: string }
  theme: { color: string }
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void
  modal: { ondismiss: () => void }
}

interface RazorpayInstance {
  open: () => void
}

interface Props {
  slug: string
  shopName: string
  retailerPhone: string
}

export function CheckoutForm({ slug, shopName, retailerPhone: _retailerPhone }: Props) {
  const router = useRouter()
  const [cart, setCart] = useState<CartMap | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pincode, setPincode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  useEffect(() => {
    setCart(loadCart(slug))
    if (!document.getElementById('razorpay-script')) {
      const script = document.createElement('script')
      script.id = 'razorpay-script'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => setScriptLoaded(true)
      document.body.appendChild(script)
    } else {
      setScriptLoaded(true)
    }
  }, [slug])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!cart || cart.size === 0) return

      setLoading(true)
      setError(null)

      try {
        const items = Array.from(cart.values()).map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        }))

        const orderRes = await fetch('/v1/public/checkout/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            customer_name: name,
            customer_phone: phone,
            shipping_address: {
              line1: addressLine1,
              line2: addressLine2 || undefined,
              city,
              state,
              pincode,
            },
          }),
        })

        const orderJson = await orderRes.json()
        if (!orderRes.ok) {
          throw new Error(orderJson.error?.message ?? 'Failed to create order')
        }

        const { data: orderData } = orderJson

        if (!window.Razorpay) {
          throw new Error('Razorpay SDK not loaded')
        }

        const razorpay = new window.Razorpay({
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: shopName,
          description: `Order #${orderData.order_id.slice(-8)}`,
          order_id: orderData.razorpay_order_id,
          prefill: { name: orderData.customer_name, contact: orderData.customer_phone },
          theme: { color: '#0891b2' },
          handler: async (response) => {
            try {
              await fetch('/v1/public/checkout/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              })
            } catch {
              // webhook is source of truth
            }
            saveCart(slug, new Map())
            router.push(`/c/${slug}/order/${orderData.order_id}`)
          },
          modal: { ondismiss: () => setLoading(false) },
        })

        razorpay.open()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setLoading(false)
      }
    },
    [cart, name, phone, addressLine1, addressLine2, city, state, pincode, shopName, slug, router],
  )

  if (cart === null) return null

  const items = Array.from(cart.values())
  const total = cartTotal(cart)

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
            <Link href={`/c/${slug}`} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Back">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-display text-lg font-bold text-gray-900">Checkout</h1>
          </div>
        </header>
        <main className="max-w-md mx-auto px-3 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag size={26} className="text-cyan-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Your cart is empty</p>
          <Link href={`/c/${slug}`} className="mt-4 inline-block text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors">
            Browse catalog
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link href={`/c/${slug}/cart`} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Back to cart">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-display text-lg font-bold text-gray-900">Checkout</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShoppingBag size={16} className="text-cyan-600" />
            Order Summary ({items.length} item{items.length > 1 ? 's' : ''})
          </h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                  {item.primary_photo_url && (
                    <Image src={item.primary_photo_url} alt={item.name ?? ''} fill sizes="48px" className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{item.name ?? item.category}</p>
                  <p className="text-xs font-bold tabular-nums text-gray-900 mt-0.5">{formatPriceRange(item.price_min, null)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-cyan-600" />
            Delivery Address
          </h2>

          {error && (
            <div className="mb-3 bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-medium text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><User size={12} /> Full Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={200} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Phone size={12} /> Phone Number</label>
              <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={15} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 1</label>
              <input type="text" required value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="House number, street, area" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={500} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 2 (optional)</label>
              <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Landmark, building name" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                <input type="text" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={100} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                <input type="text" required value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={100} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
              <input type="text" required value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="6-digit pincode" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-gray-50" maxLength={10} />
            </div>

            <button
              type="submit"
              disabled={loading || !scriptLoaded || items.length === 0}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-soft-lg transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
            >
              {loading ? (
                <><Loader2 size={20} className="animate-spin" /> Processing...</>
              ) : (
                <><CreditCard size={20} /> Pay {formatPriceRange(total, null)}</>
              )}
            </button>
            <p className="text-center text-xs text-gray-400">Your payment is processed securely through Razorpay. {shopName} receives the funds directly.</p>
          </form>
        </div>
      </main>
      <div className="h-8" />
    </div>
  )
}
