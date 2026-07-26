'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight, ChevronRight, Shield, Zap, Smartphone } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'

// ── Lazy-load below-fold sections ─────────────────────────────────

const MarketingSections = dynamic(() => import('@/app/sections/MarketingSections'), {
  ssr: false,
  loading: () => (
    <div className="py-12">
      <PageLoader variant="card" text="Loading more content..." />
    </div>
  ),
})

// ── Nav Items ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

// ── Navbar ─────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-xl border-b border-gray-100/50 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center group-hover:bg-cyan-700 transition-colors">
            <span className="text-white font-bold text-base">K</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">Kanchuki</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <a href="#pricing" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">Sign In</a>
          <a href="#cta" className="bg-cyan-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-cyan-700 transition-all shadow-sm hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">Get Started Free</a>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-700 hover:text-gray-900" aria-label="Toggle menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-white border-t border-gray-100 overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block text-sm text-gray-700 hover:text-cyan-600 font-medium py-2 transition-colors">
                  {item.label}
                </Link>
              ))}
              <hr className="border-gray-100" />
              <a href="#cta" onClick={() => setMobileOpen(false)} className="block text-center bg-cyan-600 text-white font-semibold px-5 py-3 rounded-xl hover:bg-cyan-700 transition-all">Get Started Free</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

// ── Hero ───────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 sm:pt-28 pb-16 sm:pb-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-50/80 via-white to-white pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-cyan-100/60 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-tr from-amber-50/60 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 text-sm font-medium px-4 py-2 rounded-full mb-6 sm:mb-8 border border-cyan-100">
          <span>🇮🇳</span>
          <span>Built for Indian ethnic wear retailers</span>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 tracking-tight leading-[1.1] text-balance max-w-4xl mx-auto">
          Your store on WhatsApp.{' '}
          <span className="bg-gradient-to-r from-cyan-600 to-cyan-500 bg-clip-text text-transparent">Powered by AI.</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-4 text-lg sm:text-xl text-cyan-600/80 font-medium">
          आपकी दुकान, AI की ताकत
        </motion.p>

        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-5 sm:mt-6 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Digitize your clothing shop in minutes. Share curated collections with customers via WhatsApp. AI automatically tags every product from a single photo.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#cta" className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-base sm:text-lg px-8 py-4 rounded-2xl transition-all shadow-lg shadow-cyan-200 hover:shadow-xl hover:shadow-cyan-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
            Start Free Trial <ArrowRight size={20} />
          </a>
          <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold text-base sm:text-lg px-8 py-4 rounded-2xl hover:border-cyan-300 hover:text-cyan-700 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
            See How It Works <ChevronRight size={20} />
          </a>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }} className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-gray-400">
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-green-500" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><Zap size={14} className="text-amber-500" /> No credit card</span>
          <span className="flex items-center gap-1.5"><Smartphone size={14} className="text-blue-500" /> Works without a website</span>
        </motion.div>
      </div>
    </section>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <MarketingSections />
    </>
  )
}
