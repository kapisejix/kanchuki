'use client'

// Client-only (form state + fetch) — posts to the real POST /v1/public/contact
// endpoint (apps/api/src/routes/public/public-misc.ts), which stores the
// message as an AuditLog entry an admin can see. No simulated submit.

import { useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'

const TOPICS = ['Getting started', 'Catalog help', 'Billing', 'Partnership', 'Something else'] as const

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload = {
      name: String(data.get('name') ?? '').trim(),
      shop_city: String(data.get('shop_city') ?? '').trim() || undefined,
      topic: String(data.get('topic') ?? TOPICS[0]),
      message: String(data.get('message') ?? '').trim(),
    }
    if (!payload.name || !payload.message) return

    setStatus('sending')
    try {
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/v1/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('failed')
      setStatus('sent')
      form.reset()
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-turmeric-200 bg-turmeric-50 p-8 text-center">
        <p className="text-charcoal font-semibold mb-1">Message sent.</p>
        <p className="text-sm text-sand-600">We read it the same day, during business hours (10 AM–7 PM IST).</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-sand-200 bg-white p-6 sm:p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-charcoal mb-1.5">Name</label>
          <input id="name" name="name" type="text" required maxLength={100} className="w-full border border-sand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-ink-500" />
        </div>
        <div>
          <label htmlFor="shop_city" className="block text-sm font-medium text-charcoal mb-1.5">Shop / City</label>
          <input id="shop_city" name="shop_city" type="text" maxLength={200} className="w-full border border-sand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-ink-500" />
        </div>
      </div>
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-charcoal mb-1.5">What do you need?</label>
        <select id="topic" name="topic" className="w-full border border-sand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-ink-500 bg-white">
          {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-charcoal mb-1.5">Message</label>
        <textarea id="message" name="message" required maxLength={2000} rows={5} className="w-full border border-sand-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-ink-500" />
      </div>
      {status === 'error' && (
        <p className="text-sm text-red-600">Something went wrong — try again, or email support@kanchuki.app directly.</p>
      )}
      <button type="submit" disabled={status === 'sending'} className="inline-flex items-center gap-2 bg-ink-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-ink-700 transition active:scale-[0.97] disabled:opacity-50">
        {status === 'sending' ? 'Sending…' : 'Send'} <Send size={16} strokeWidth={1.5} />
      </button>
    </form>
  )
}
