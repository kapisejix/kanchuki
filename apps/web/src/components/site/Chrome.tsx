'use client'

// Shared marketing-site chrome (Navbar, Footer) + the small motion/layout
// primitives every page composes with (Section, SectionHeader, ColorCard,
// AnimatedSection, Marquee). Extracted so the content pages (for-retailers,
// for-customers, how-it-works, pricing, faq, about, testimonials, contact)
// don't each reinvent the header/footer.
//
// Design system: colabs.com.au (Awwwards SOTD 2023) — warm off-white canvas
// (#F9F8F6), near-black ink (#060606), yellow-lime accent (#D9DB4D), and a
// rainbow of solid-color modular cards. Display type: Space Grotesk (the free
// stand-in for Colabs' Matter Square). Motion: lenis smooth scroll (Navbar
// mounts it — Navbar only ever renders on marketing pages), CSS marquee for
// the signature auto-scrolling service cards, framer-motion reveals.
// Palette tokens: apps/web/tailwind.config.ts ("CoLab marketing palette").

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import Lenis from 'lenis'
import { Menu, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
// Accent maps live in a separate server-safe module (no 'use client') so the
// Server-Component marketing pages can index into them at render time. Re-
// exported here for the client components that already import from Chrome.
import { ACCENT_BG, ACCENT_TEXT, ACCENT_SUBTLE, type ColorAccent } from '@/components/site/accents'
export { ACCENT_BG, ACCENT_TEXT, ACCENT_SUBTLE } from '@/components/site/accents'

// ── Motion variants ────────────────────────────────────────────────

export const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

// "Drape" entrance — kept for the marketing heroes.
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
  { label: 'Stores', href: '/stores' },
  { label: 'FAQ', href: '/faq' },
]

export function Navbar({ ctaHref = '/pricing' }: { ctaHref?: string }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Lenis smooth scroll — Colabs' signature inertial scroll feel. Mounted
  // here because Navbar renders on every marketing page and nowhere else
  // (storefront + admin have their own chrome), so the effect stays scoped
  // to the marketing site. Honors prefers-reduced-motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      anchors: true,
    })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition duration-300 ${
        scrolled
          ? 'bg-cream/90 backdrop-blur-xl border-b border-carbon/10 shadow-[0_1px_0_rgba(6,6,6,0.04)]'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center group" aria-label="Kanchuki — home">
          {/* Brand wordmark (dark-navy rounded block with red i-dot) — the
              official logo asset, apps/web/public/kanchuki-logo.png. Height
              ~34px on desktop; the 884×176 source keeps its 5:1 ratio. */}
          <Image
            src="/kanchuki-logo.png"
            alt="Kanchuki"
            width={884}
            height={176}
            priority
            className="h-8 sm:h-9 w-auto rounded-md transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {SITE_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-carbon/60 hover:text-carbon transition-colors font-medium">
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link href="/billing" className="text-sm font-semibold text-carbon/70 hover:text-carbon transition-colors">Sign In</Link>
          <Link
            href={ctaHref}
            className="bg-volt text-carbon text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-volt-600 hover:text-carbon transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-600 focus-visible:ring-offset-2 ring-offset-cream"
          >
            Start Free Trial
          </Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-carbon/70 hover:text-carbon" aria-label="Toggle menu">
          {mobileOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
        </button>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-cream border-b border-carbon/10 overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {SITE_NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block text-sm text-carbon/70 hover:text-carbon font-medium py-2 transition-colors">
                  {item.label}
                </Link>
              ))}
              <hr className="border-carbon/10" />
              <Link href="/billing" onClick={() => setMobileOpen(false)} className="block text-sm text-carbon/70 hover:text-carbon font-medium py-2 transition-colors">Sign In</Link>
              <Link href={ctaHref} onClick={() => setMobileOpen(false)} className="block text-center bg-volt text-carbon font-semibold px-5 py-3 rounded-full hover:bg-volt-600 transition">Start Free Trial</Link>
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
  { label: 'Stores', href: '/stores' },
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
    <footer className="bg-carbon border-t border-carbon-50/20 py-12 sm:py-16 text-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-cream/10">
          <div>
            <div className="mb-3">
              <Image
                src="/kanchuki-logo.png"
                alt="Kanchuki"
                width={884}
                height={176}
                className="h-8 w-auto rounded-md"
              />
            </div>
            <p className="text-cream/50 text-sm leading-relaxed">Your store on WhatsApp, powered by AI.</p>
            <p className="text-cream/40 text-sm mt-1">आपकी दुकान, AI की ताकत</p>
          </div>
          <div>
            <div className="text-cream/80 text-sm font-semibold mb-3">Product</div>
            <ul className="space-y-2.5">
              {FOOTER_PRODUCT_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-cream/50 hover:text-volt transition-colors text-sm">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-cream/80 text-sm font-semibold mb-3">Company</div>
            <ul className="space-y-2.5">
              {FOOTER_COMPANY_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-cream/50 hover:text-volt transition-colors text-sm">{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-cream/80 text-sm font-semibold mb-3">Support &amp; Legal</div>
            <ul className="space-y-2.5">
              {FOOTER_SUPPORT_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-cream/50 hover:text-volt transition-colors text-sm">{l.label}</Link></li>
              ))}
              <li><a href="mailto:support@kanchuki.app" className="text-cream/50 hover:text-volt transition-colors text-sm">support@kanchuki.app</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-cream/40 text-sm text-center">© {new Date().getFullYear()} Kanchuki. Made in India <span className="inline-block">🇮🇳</span></p>
          <a href="/admin" className="text-cream/30 hover:text-volt transition-colors text-xs">Admin</a>
        </div>
      </div>
    </footer>
  )
}

// ── Layout / motion primitives ──────────────────────────────────────

// Colabs-style solid color-chip card — a saturated block, not a white card
// with an accent strip. Each accent maps to a bg + readable text pair (see
// accents.ts for the maps).

export function ColorCard({ children, accent = 'cobalt', className = '' }: { children: React.ReactNode; accent?: ColorAccent; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${ACCENT_BG[accent]} ${ACCENT_TEXT[accent]} transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(6,6,6,0.45)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Section({ children, id, className = '', dark = false }: { children: React.ReactNode; id?: string; className?: string; dark?: boolean }) {
  return (
    <section id={id} className={`py-16 sm:py-20 lg:py-28 ${dark ? 'bg-carbon text-cream' : 'bg-cream'} ${className}`}>
      {children}
    </section>
  )
}

export function SectionHeader({ tag, title, subtitle, dark = false, align = 'center' }: { tag?: string; title: string; subtitle?: string; dark?: boolean; align?: 'center' | 'left' }) {
  return (
    <div className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''} mb-12 sm:mb-16`}>
      {tag && (
        <span className={`inline-block text-xs font-semibold tracking-[0.22em] uppercase mb-3 ${dark ? 'text-volt' : 'text-cobalt-600'}`}>
          {tag}
        </span>
      )}
      <h2 className={`font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-balance leading-[1.08] ${dark ? 'text-cream' : 'text-carbon'}`}>{title}</h2>
      {subtitle && <p className={`mt-4 text-lg ${dark ? 'text-cream/60' : 'text-carbon/60'}`}>{subtitle}</p>}
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

// ── Marquee — the Colabs signature ──────────────────────────────────
// Infinite horizontal auto-scroll of modular cards. The track holds TWO
// copies of the content and translates -50% for a seamless loop (see the
// `marquee` keyframes in tailwind.config.ts). Pauses on hover; the CSS
// `motion-reduce:animate-none` disables it for reduced-motion users; edge
// fade masks soften the cut-in.

export function Marquee({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`group relative overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] ${className}`}
    >
      <div className="flex w-max animate-marquee motion-reduce:animate-none group-hover:[animation-play-state:paused]">
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden="true">{children}</div>
      </div>
    </div>
  )
}

// ── Page hero — shared H1 header used by every deep page ───────────

export function PageHero({ tag, title, lead }: { tag?: string; title: string; lead: string }) {
  return (
    <section className="relative pt-32 sm:pt-40 pb-14 sm:pb-20 overflow-hidden bg-cream">
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div initial="hidden" animate="visible" variants={drape} style={{ transformOrigin: 'top' }}>
          {tag && (
            <span className="inline-block text-xs font-semibold tracking-[0.22em] uppercase text-cobalt-600 mb-6">
              {tag}
            </span>
          )}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-carbon tracking-tight leading-[1.06] text-balance">
            {title}
          </h1>
          <p className="mt-5 sm:mt-6 text-lg sm:text-xl text-carbon/60 max-w-2xl mx-auto leading-relaxed">
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
          <motion.h2 variants={fadeUp} className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-balance">{title}</motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-lg text-cream/60 max-w-2xl mx-auto">{lead}</motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={primaryHref} className="inline-flex items-center justify-center bg-volt text-carbon font-semibold px-8 py-4 rounded-full hover:bg-volt-600 transition active:scale-[0.97] group">
              {primaryLabel} <ArrowRight size={18} strokeWidth={1.5} className="ml-2 transition-transform group-hover:translate-x-0.5" />
            </Link>
            {secondaryLabel && secondaryHref && (
              <Link href={secondaryHref} className="inline-flex items-center justify-center border border-cream/30 text-cream font-semibold px-8 py-4 rounded-full hover:border-volt hover:text-volt transition active:scale-[0.97]">{secondaryLabel}</Link>
            )}
          </motion.div>
        </motion.div>
      </div>
    </Section>
  )
}
