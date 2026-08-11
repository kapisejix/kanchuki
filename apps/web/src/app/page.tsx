'use client'

import { motion } from 'framer-motion'
import { ArrowRight, ChevronRight, Shield, Zap, Smartphone } from 'lucide-react'
import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'
import { Navbar, drape } from '@/components/site/Chrome'

// ── JSON-LD structured data (docs/content/pages/homepage.md "Page metadata") ─
// Organization + WebSite, authored statically (no user/DB input). `<` is
// escaped so the payload can never prematurely close the script tag.
// Same SITE_URL fallback convention as layout.tsx / lib/sitemap.ts.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kanchuki.app'

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Kanchuki',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/og-image.png`,
      description:
        'AI-powered fashion collections for Indian clothing stores. Catalog products in seconds with AI auto-tagging, share via WhatsApp, no website needed.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'Kanchuki',
      inLanguage: 'en-IN',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

// ── Lazy-load below-fold sections ─────────────────────────────────

const MarketingSections = dynamic(() => import('@/app/sections/MarketingSections'), {
  ssr: false,
  loading: () => (
    <div className="py-12">
      <PageLoader variant="card" text="Loading more content..." />
    </div>
  ),
})

// ── Hero ───────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-[92vh] flex items-center pt-24 sm:pt-28 pb-16 sm:pb-20 overflow-hidden bg-cream">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div initial="hidden" animate="visible" variants={drape} style={{ transformOrigin: 'top' }} className="inline-flex items-center gap-2 bg-white text-carbon/70 text-sm font-medium px-4 py-2 rounded-full mb-6 sm:mb-8 border border-carbon/10">
          <span>🇮🇳</span>
          <span>Built for Indian ethnic wear retailers</span>
        </motion.div>

        <motion.h1 initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.05 }} style={{ transformOrigin: 'top' }} className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-semibold text-carbon tracking-tight leading-[1.02] text-balance max-w-5xl mx-auto">
          Your store on WhatsApp.{' '}
          <span className="relative inline-block">
            <span className="text-cobalt-600">Powered by AI.</span>
            <span aria-hidden="true" className="absolute left-0 -bottom-2 sm:-bottom-3 w-full h-2 sm:h-3 bg-volt/70 -skew-x-12" />
          </span>
        </motion.h1>

        <motion.p initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.1 }} style={{ transformOrigin: 'top' }} className="mt-6 text-lg sm:text-xl text-carbon/60 font-medium">
          आपकी दुकान, AI की ताकत
        </motion.p>

        <motion.p initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.15 }} style={{ transformOrigin: 'top' }} className="mt-5 sm:mt-6 text-lg sm:text-xl text-carbon/50 max-w-2xl mx-auto leading-relaxed">
          Digitize your clothing shop in minutes. Share curated collections with customers via WhatsApp. AI automatically tags every product from a single photo.
        </motion.p>

        <motion.div initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.2 }} style={{ transformOrigin: 'top' }} className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#cta" className="inline-flex items-center justify-center gap-2 bg-volt hover:bg-volt-600 text-carbon font-bold text-base sm:text-lg px-8 py-4 rounded-full transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-600 focus-visible:ring-offset-2 ring-offset-cream">
            Start Free Trial <ArrowRight size={20} strokeWidth={1.5} />
          </a>
          <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 border border-carbon/20 text-carbon font-semibold text-base sm:text-lg px-8 py-4 rounded-full hover:border-cobalt-500 hover:text-cobalt-600 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500 focus-visible:ring-offset-2 ring-offset-cream">
            See How It Works <ChevronRight size={20} strokeWidth={1.5} />
          </a>
        </motion.div>

        <motion.div initial="hidden" animate="visible" variants={drape} transition={{ delay: 0.25 }} style={{ transformOrigin: 'top' }} className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-carbon/40">
          <span className="flex items-center gap-1.5"><Shield size={14} strokeWidth={1.5} className="text-cobalt-600" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><Zap size={14} strokeWidth={1.5} className="text-volt-700" /> No credit card</span>
          <span className="flex items-center gap-1.5"><Smartphone size={14} strokeWidth={1.5} className="text-carbon/60" /> Works without a website</span>
        </motion.div>
      </div>
    </section>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* JSON-LD from a static, locally-authored schema object — `<` escaped so
          the payload can never prematurely close the script tag. Renders in the
          SSR HTML (this component tree is server-rendered), so crawlers that
          don't execute JS still see it. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Navbar />
      <Hero />
      <MarketingSections />
    </>
  )
}
