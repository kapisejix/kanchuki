'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Clock, CreditCard, Package } from 'lucide-react'
import { formatPriceRange } from '@kanchuki/shared'

interface Props {
  slug: string
  orderId: string
}

interface OrderData {
  id: string
  status: string
  total_amount: number
  gst_amount: number
  subtotal_amount: number
  gst_invoice_number: string | null
  customer_name: string
  paid_at: string | null
  created_at: string
  items: Array<{
    product_name_snapshot: string | null
    price_snapshot: number
    quantity: number
  }>
}

export function OrderView({ slug, orderId }: Props) {
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/v1/public/orders/${orderId}`)
        if (!res.ok) throw new Error('Failed to load order')
        const json = await res.json()
        if (!cancelled) {
          setOrder(json.data)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load order')
          setLoading(false)
        }
      }
    }
    fetchOrder()
    const interval = setInterval(fetchOrder, 3000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (!cancelled) setLoading(false)
    }, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [orderId])

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Clock size={26} className="text-cyan-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Confirming your payment...</p>
          <p className="text-xs text-gray-400 mt-1">Please wait a moment</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
            <Link href={`/c/${slug}`} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Back"><ArrowLeft size={20} /></Link>
            <h1 className="font-display text-lg font-bold text-gray-900">Order Status</h1>
          </div>
        </header>
        <main className="max-w-md mx-auto px-3 py-20 text-center">
          <p className="text-sm font-medium text-gray-700">{error ?? 'Order not found'}</p>
          <Link href={`/c/${slug}`} className="mt-4 inline-block text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors">Back to catalog</Link>
        </main>
      </div>
    )
  }

  const isPaid = order.status === 'PAID' || order.status === 'FULFILLED'
  const isPending = order.status === 'PENDING_PAYMENT'

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link href={`/c/${slug}`} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors" aria-label="Back to catalog"><ArrowLeft size={20} /></Link>
          <h1 className="font-display text-lg font-bold text-gray-900">Order Confirmed</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-6 space-y-4">
        <div className={`rounded-2xl p-6 text-center border ${isPaid ? 'bg-green-50 border-green-100' : isPending ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${isPaid ? 'bg-green-100' : isPending ? 'bg-amber-100' : 'bg-gray-200'}`}>
            {isPaid ? <CheckCircle size={28} className="text-green-600" /> : <Clock size={28} className="text-amber-600" />}
          </div>
          <h2 className={`font-display text-xl font-bold ${isPaid ? 'text-green-800' : isPending ? 'text-amber-800' : 'text-gray-600'}`}>
            {isPaid ? 'Payment Successful!' : isPending ? 'Payment Pending' : order.status}
          </h2>
          <p className={`text-sm mt-1 ${isPaid ? 'text-green-700' : isPending ? 'text-amber-700' : 'text-gray-500'}`}>
            {isPaid ? 'Your order has been placed.' : isPending ? 'Your payment is being confirmed.' : `Status: ${order.status}`}
          </p>
          {order.paid_at && (
            <p className="text-xs text-gray-500 mt-2">Paid on {new Date(order.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Package size={16} className="text-cyan-600" /> Order #{order.id.slice(-8)}</h3>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-700 truncate mr-2">{item.product_name_snapshot ?? 'Product'}</span>
                <span className="font-medium tabular-nums text-gray-900 flex-shrink-0">{formatPriceRange(item.price_snapshot, null)}</span>
              </div>
            ))}
          </div>
          <hr className="border-gray-100" />
          <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span className="tabular-nums">{formatPriceRange(order.subtotal_amount, null)}</span></div>
          <div className="flex justify-between text-sm text-gray-600"><span>GST</span><span className="tabular-nums">{formatPriceRange(order.gst_amount, null)}</span></div>
          <div className="flex justify-between font-semibold text-gray-900 text-sm"><span>Total</span><span className="tabular-nums">{formatPriceRange(order.total_amount, null)}</span></div>
          {order.gst_invoice_number && (
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2">
              <CreditCard size={14} className="text-gray-400" />
              <div><p className="text-xs font-medium text-gray-600">Invoice #</p><p className="text-xs text-gray-500 font-mono">{order.gst_invoice_number}</p></div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">What happens next?</h3>
          <ul className="space-y-1.5 text-xs text-gray-600">
            <li className="flex items-start gap-2"><CheckCircle size={12} className="text-green-500 mt-0.5 flex-shrink-0" /><span>The store will prepare your items for delivery.</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={12} className="text-green-500 mt-0.5 flex-shrink-0" /><span>You will be contacted on {order.customer_name} via phone for delivery coordination.</span></li>
            <li className="flex items-start gap-2"><CheckCircle size={12} className="text-green-500 mt-0.5 flex-shrink-0" /><span>View your order using the invoice number above.</span></li>
          </ul>
        </div>

        <Link href={`/c/${slug}`} className="block w-full text-center bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-4 rounded-2xl shadow-soft-lg transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
          Continue Shopping
        </Link>
      </main>
      <div className="h-8" />
    </div>
  )
}
