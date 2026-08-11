'use client'

// Shared marketing-site chrome (Navbar, Footer) + the small motion/layout
// primitives every page composes with (Section, SectionHeader, SelvedgeCard,
// AnimatedSection). Extracted from page.tsx / MarketingSections.tsx so the
// new content pages (for-retailers, for-customers, how-it-works, pricing,
// faq, about, testimonials, contact) don't each reinvent the header/footer.
// Design system: docs/design/emil-design.md (Black & Gold Elegance).

import { useState, useEffect, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { KanchukiMark } from '@/components/KanchukiMark'

// ── Motion variants ────────────────────────────────────────────────

export const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

// "Drape" entrance (docs/design/emil-design.md §3.6) — reserved for page
// heroes on the low-frequency marketing surface.
export const drape = {
  hidden: { opacity: 0, scaleY: 0.96, skewX: -1 },
  visible: {
    opacity: 1,
    scaleY: 1,
    skewX: 0,
    transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] as const },
  },
}

// ── Site navigation — shared across every marketing page ───────────

export const SITE_NAV_ITEMS = [
  { label: 'For Retailers', href: '/for-retailers' },
  { label: 'For Customers', href: '/for-customers' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
]

export function Navbar({ ctaHref = '/pricing' }: { ctaHref?: string }) {
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
          {SITE_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-sand-600 hover:text-charcoal transition-colors font-medium">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link href="/billing" className="text-sm font-semibold text-sand-700 hover:text-charcoal transition-colors">Sign In</Link>
          <Link href={ctaHref} className="bg-ink-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-ink-700 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-500 focus-visible:ring-offset-2">Start Free Trial</Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-sand-700 hover:text-charcoal" aria-label="Toggle menu">
          {mobileOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-cotton border-t border-sand-200 overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {SITE_NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block text-sm text-sand-700 hover:text-ink-600 font-medium py-2 transition-colors">
                  {item.label}
                </Link>
              ))}
              <hr className="border-sand-200" />
              <Link href="/billing" onClick={() => setMobileOpen(false)} className="block text-sm text-sand-700 hover:text-ink-600 font-medium py-2 transition-colors">Sign In</Link>
              <Link href={ctaHref} onClick={() => setMobileOpen(false)} className="block text-center bg-ink-600 text-white font-semibold px-5 py-3 rounded-full hover:bg-ink-700 transition">Start Free Trial</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

// ── Footer ───────────────────────────────────────────────────────────

const FOOTER_PRODUCT_LINKS = [
  { label: 'For Retailers', href: '/for-retailers' },
  { label: 'For Customers', href: '/for-customers' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
]

const FOOTER_COMPANY_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'Testimonials', href: '/testimonials' },
  { label: 'Contact', href: '/contact' },
]

const FOOTER_SUPPORT_LINKS = [
  { label: 'FAQ', href: '/faq' },
  { label: 'Terms', href: '/terms' },
  { label: 'Privacy', href: '/privacy' },
]

export function Footer() {
  return (
    <footer className="bg-charcoal border-t border-sand-800 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-sand-800">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <KanchukiMark size={28} />
              <span className="font-display text-sand-200 font-semibold">Kanchuki</span>
            </div>
            <p className="text-sand-500 text-sm leading-relaxed">Your store on WhatsApp, powered by AI.</p>
            <p className="text-sand-600 text-sm mt-1">आपकी दुकान, AI की ताकत</p>
          </div>
          <div>
            <div className="text-sand-300 text-sm font-semibold mb-3">Product</div>
            <ul className="space-y-2.5">
              {FOOTER_PRODUCT_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sand-500 hover:text-sand-300 transition-colors text-sm">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sand-300 text-sm font-semibold mb-3">Company</div>
            <ul className="space-y-2.5">
              {FOOTER_COMPANY_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sand-500 hover:text-sand-300 transition-colors text-sm">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sand-300 text-sm font-semibold mb-3">Support &amp; Legal</div>
            <ul className="space-y-2.5">
              {FOOTER_SUPPORT_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sand-500 hover:text-sand-300 transition-colors text-sm">{l.label}</Link></li>
              ))}
              <li><a href="mailto:support@kanchuki.app" className="text-sand-500 hover:text-sand-300 transition-colors text-sm">support@kanchuki.app</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sand-500 text-sm text-center">© {new Date().getFullYear()} Kanchuki. Made in India <span className="inline-block">🇮🇳</span></p>
          <a href="/admin" className="text-sand-600 hover:text-sand-400 transition-colors text-xs">Admin</a>
        </div>
      </div>
    </footer>
  )
}

// ── Layout / motion primitives ──────────────────────────────────────

// "Selvedge-edge" card (docs/design/emil-design.md §3.6) — a flat card
// with a self-finished-edge detail on one side instead of a glass/shadow
// treatment. No blur, no drop shadow in normal document flow.
const ACCENT_STRIP: Record<string, string> = {
  ink: 'bg-ink-600',
  rust: 'bg-rust-600',
  turmeric: 'bg-turmeric-600',
}

export function SelvedgeCard({ children, accent = 'ink', className = '' }: { children: React.ReactNode; accent?: 'ink' | 'rust' | 'turmeric'; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-white rounded-xl border border-sand-200 transition-colors duration-300 hover:border-sand-300 ${className}`}>
      <div className={`absolute inset-x-0 top-0 h-[3px] ${ACCENT_STRIP[accent]}`} />
      {children}
    </div>
  )
}

export function Section({ children, id, className = '', dark = false }: { children: React.ReactNode; id?: string; className?: string; dark?: boolean }) {
  return (
    <section id={id} className={`py-16 sm:py-20 lg:py-28 ${dark ? 'bg-charcoal text-white' : 'bg-cotton'} ${className}`}>
      {children}
    </section>
  )
}

export function SectionHeader({ tag, title, subtitle, dark = false, align = 'center' }: { tag?: string; title: string; subtitle?: string; dark?: boolean; align?: 'center' | 'left' }) {
  return (
    <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''} mb-12 sm:mb-16`}>
      {tag && <span className="inline-block text-xs font-semibold tracking-widest uppercase text-rust-600 mb-3">{tag}</span>}
      <h2 className={`font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance ${dark ? 'text-white' : 'text-charcoal'}`}>{title}</h2>
      {subtitle && <p className={`mt-4 text-lg ${dark ? 'text-sand-300' : 'text-sand-500'}`}>{subtitle}</p>}
    </div>
  )
}

export function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={fadeUp} className={className}>
      {children}
    </motion.div>
  )
}

// ── Page hero — shared H1 header used by every deep page ───────────

export function PageHero({ tag, title, lead }: { tag?: string; title: string; lead: string }) {
  return (
    <section className="relative pt-32 sm:pt-40 pb-14 sm:pb-20 overflow-hidden bg-cotton">
      <div className="absolute inset-0 bg-gradient-to-br from-glow/15 via-transparent to-veil/10 pointer-events-none" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div initial="hidden" animate="visible" variants={drape} style={{ transformOrigin: 'top' }}>
          {tag && (
            <span className="inline-flex items-center gap-2 bg-ink-50 text-ink-700 text-sm font-medium px-4 py-2 rounded-full mb-6 border border-ink-100">
              {tag}
            </span>
          )}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-charcoal tracking-tight leading-[1.1] text-balance">
            {title}
          </h1>
          <p className="mt-5 sm:mt-6 text-lg sm:text-xl text-sand-500 max-w-2xl mx-auto leading-relaxed">
            {lead}
          </p>
        </motion.div>
      </div>
    </section>
  )
}

// ── Reusable final-CTA block ─────────────────────────────────────────

export function FinalCta({ title, lead, primaryLabel = 'Start Free Trial', primaryHref = '/pricing', secondaryLabel, secondaryHref }: { title: string; lead: string; primaryLabel?: string; primaryHref?: string; secondaryLabel?: string; secondaryHref?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  return (
    <Section dark>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center" ref={ref}>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger}>
          <motion.h2 variants={fadeUp} className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance">{title}</motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-lg text-sand-300 max-w-2xl mx-auto">{lead}</motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={primaryHref} className="inline-flex items-center justify-center bg-white text-charcoal font-semibold px-8 py-4 rounded-full hover:bg-sand-100 transition active:scale-[0.97]">{primaryLabel}</Link>
            {secondaryLabel && secondaryHref && (
              <Link href={secondaryHref} className="inline-flex items-center justify-center border border-sand-600 text-sand-200 font-semibold px-8 py-4 rounded-full hover:border-sand-400 hover:text-white transition active:scale-[0.97]">{secondaryLabel}</Link>
            )}
          </motion.div>
        </motion.div>
      </div>
    </Section>
  )
}
