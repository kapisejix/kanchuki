'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight, ChevronRight, Shield, Zap, Smartphone } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'
import { KanchukiMark } from '@/components/KanchukiMark'

// ── Lazy-load below-fold sections ─────────────────────────────────

const MarketingSections = dynamic(() => import('@/app/sections/MarketingSections'), {
  ssr: false,
  loading: () => (
    <div className="py-12">
      <PageLoader variant="card" text="Loading more content..." />
    </div>
  ),
})

// ── Motion — the "drape" entrance (docs/design/emil-design.md §3.6):
// content settles into place like cloth unfurling, instead of a plain
// fade/slide. Reserved for the low-frequency, high-impact marketing
// surface only — never used on the retailer app or admin.

const drape = {
  hidden: { opacity: 0, scaleY: 0.96, skewX: -1 },
  visible: {
    opacity: 1,
    scaleY: 1,
    skewX: 0,
    transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] as const },
  },
}

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
      className={`fixed top-0 left-0 right-0 z-50 transition duration-300 ${
        scrolled
          ? 'bg-cotton/90 backdrop-blur-xl border-b border-sand-200 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <KanchukiMark size={36} className="group-hover:bg-ink-700 transition-colors" />
          <span className="font-display font-semibold text-charcoal text-lg">Kanchuki</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-sand-600 hover:text-charcoal transition-colors font-medium">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <a href="#pricing" className="text-sm font-semibold text-sand-700 hover:text-charcoal transition-colors">Sign In</a>
          <a href="#cta" className="bg-ink-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-ink-700 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2">Get Started Free</a>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-sand-700 hover:text-charcoal" aria-label="Toggle menu">
          {mobileOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-cotton border-t border-sand-200 overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block text-sm text-sand-700 hover:text-ink-600 font-medium py-2 transition-colors">
                  {item.label}
                </Link>
              ))}
              <hr className="border-sand-200" />
              <a href="#cta" onClick={() => setMobileOpen(false)} className="block text-center bg-ink-600 text-white font-semibold px-5 py-3 rounded-full hover:bg-ink-700 transition">Get Started Free</a>
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
    <section className="relative min-h-[90vh] flex items-center pt-24 sm:pt-28 pb-16 sm:pb-20 overflow-hidden bg-cotton">
      {/* Dawn wash — the palette's two cool notes (icy sky, sweet petal) laid
          in faint from opposite corners, echoing the Red Elegance swatch's
          own hero-panel gradient without copying its literal layout. */}
      <div className="absolute inset-0 bg-gradient-to-br from-icy/25 via-transparent to-petal/20 pointer-events-none" />

      {/* Woven texture — a crosshatch of hairlines standing in for the
          glass/gradient-blob hero background most AI-SaaS sites use.
          Cheap (a single repeating-linear-gradient), no blur, no GPU tax. */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--color-charcoal) 0, var(--color-charcoal) 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, var(--color-charcoal) 0, var(--color-charcoal) 1px, transparent 1px, transparent 12px)',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div initial="hidden" animate="visible" variants={drape} style={{ transformOrigin: 'top' }} className="inline-flex items-center gap-2 bg-ink-50 text-ink-700 text-sm font-medium px-4 py-2 rounded-full mb-6 sm:mb-8 border border-ink-100">
          <span>🇮🇳</span>
          <span>Built for Indian ethnic wear retailers</span>
        </motion.div>

        <motion.h1 initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.05 }} style={{ transformOrigin: 'top' }} className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-semibold text-charcoal tracking-tight leading-[1.1] text-balance max-w-4xl mx-auto">
          Your store on WhatsApp.{' '}
          <span className="text-rust-600">Powered by AI.</span>
        </motion.h1>

        <motion.p initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.1 }} style={{ transformOrigin: 'top' }} className="mt-4 text-lg sm:text-xl text-ink-600/80 font-medium">
          आपकी दुकान, AI की ताकत
        </motion.p>

        <motion.p initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.15 }} style={{ transformOrigin: 'top' }} className="mt-5 sm:mt-6 text-lg sm:text-xl text-sand-500 max-w-2xl mx-auto leading-relaxed">
          Digitize your clothing shop in minutes. Share curated collections with customers via WhatsApp. AI automatically tags every product from a single photo.
        </motion.p>

        <motion.div initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.2 }} style={{ transformOrigin: 'top' }} className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#cta" className="inline-flex items-center justify-center gap-2 bg-ink-600 hover:bg-ink-700 text-white font-bold text-base sm:text-lg px-8 py-4 rounded-full transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2">
            Start Free Trial <ArrowRight size={20} strokeWidth={1.5} />
          </a>
          <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 border border-sand-300 text-sand-700 font-semibold text-base sm:text-lg px-8 py-4 rounded-full hover:border-ink-300 hover:text-ink-700 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2">
            See How It Works <ChevronRight size={20} strokeWidth={1.5} />
          </a>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.25 }} style={{ transformOrigin: 'top' }} className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-sand-400">
          <span className="flex items-center gap-1.5"><Shield size={14} strokeWidth={1.5} className="text-turmeric-600" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><Zap size={14} strokeWidth={1.5} className="text-rust-500" /> No credit card</span>
          <span className="flex items-center gap-1.5"><Smartphone size={14} strokeWidth={1.5} className="text-ink-500" /> Works without a website</span>
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
