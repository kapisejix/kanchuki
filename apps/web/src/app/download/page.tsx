'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Smartphone, Mail, Bell, Camera, Share2, Search } from 'lucide-react'

export default function DownloadPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    // Simulate signup — replace with actual API/webhook when ready
    await new Promise((r) => setTimeout(r, 800))
    setSubmitted(true)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center group-hover:bg-violet-700 transition-colors">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">Kanchuki</span>
        </Link>
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Back to Home
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 pt-12 pb-24 text-center">
        {/* Coming soon badge */}
        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 text-sm font-medium px-4 py-2 rounded-full mb-8 border border-amber-100">
          <Bell size={14} />
          <span>Early access — launching soon</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight text-balance mb-4">
          Kanchuki Mobile App
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10">
          Manage your clothing store from your phone. AI tagging, WhatsApp collections, customer CRM
          — all in one app.
        </p>

        {/* App store buttons — disabled placeholders */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <div className="flex items-center gap-3 bg-gray-100 text-gray-400 px-6 py-4 rounded-2xl cursor-not-allowed opacity-60">
            <Smartphone size={24} />
            <div className="text-left">
              <div className="text-xs">Coming soon on</div>
              <div className="font-bold">Google Play</div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-100 text-gray-400 px-6 py-4 rounded-2xl cursor-not-allowed opacity-60">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/>
              <path d="M10 2c1 .5 2 2 2 5"/>
            </svg>
            <div className="text-left">
              <div className="text-xs">Coming soon on</div>
              <div className="font-bold">App Store</div>
            </div>
          </div>
        </div>

        {/* Features preview */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12 text-left">
          {[
            {
              icon: Camera,
              title: 'AI Photo Catalog',
              desc: 'Snap product photos and get auto-tagged catalog entries with category, color, fabric, and occasion.',
            },
            {
              icon: Share2,
              title: 'WhatsApp Collections',
              desc: 'Select products, generate a link, and share with customers on WhatsApp in one tap.',
            },
            {
              icon: Search,
              title: 'AI-Powered Search',
              desc: 'Find any product with natural language — "pink cotton suit under ₹2000" — or search in Hindi.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center mb-4">
                <f.icon size={20} className="text-violet-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Waitlist signup */}
        <div className="bg-gradient-to-br from-violet-50 to-white rounded-3xl p-8 sm:p-10 border border-violet-100 max-w-lg mx-auto">
          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={24} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re on the list!</h2>
              <p className="text-sm text-gray-500">
                We&apos;ll email you at <strong className="text-gray-700">{email}</strong> when the
                app is ready. First batch gets early access and a month free.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Get notified when we launch
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Be the first to know. Early adopters get 1 month free on any plan.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {submitting ? 'Signing up...' : 'Notify Me'}
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-4">
                No spam. We&apos;ll only email you about the app launch.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">K</span>
            </div>
            <span className="text-gray-700 font-semibold text-sm">Kanchuki</span>
          </div>
          <p className="text-gray-400 text-xs">
            © {new Date().getFullYear()} Kanchuki. Made in India 🇮🇳
          </p>
          <div className="flex gap-4 text-xs text-gray-400">
            <Link href="/" className="hover:text-gray-700">Home</Link>
            <a href="mailto:hello@kanchuki.app" className="hover:text-gray-700">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
