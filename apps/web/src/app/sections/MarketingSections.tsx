'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Camera,
  Share2,
  Search,
  Heart,
  Store,
  MapPin,
  Star,
  ArrowRight,
  ChevronDown,
  Check,
  IndianRupee,
  Smartphone,
  MessageCircle,
  Shirt,
  BarChart3,
  Package,
  QrCode,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { PLAN_PRICING } from '@kanchuki/shared'
import StoreLogo from '@/components/site/StoreLogo'
import { Section, SectionHeader, ColorCard, AnimatedSection, Marquee, Footer, fadeUp, stagger, ACCENT_BG, ACCENT_TEXT, ACCENT_SUBTLE } from '@/components/site/Chrome'
import { type ColorAccent } from '@/components/site/accents'

// ── Types ─────────────────────────────────────────────────────────

type PlanName = 'Starter' | 'Growth' | 'Pro'
type Period = 'monthly' | 'annual'

interface FaqItem {
  q: string
  a: string
}

const PLANS: {
  name: PlanName; planKey: 'STARTER' | 'GROWTH' | 'PRO'; features: string[];
  highlight: boolean; cta: string;
}[] = [
  {
    name: 'Starter', planKey: 'STARTER',
    features: ['500 products', 'Unlimited customers', '50 collection links/month', 'AI auto-tagging', 'Manual WhatsApp share'],
    highlight: false, cta: 'Start Free Trial',
  },
  {
    name: 'Growth', planKey: 'GROWTH',
    features: ['2,000 products', 'Unlimited customers', 'Unlimited collection links', '100 try-on credits/month', 'Fashion DNA preferences', 'Priority support'],
    highlight: true, cta: 'Start Free Trial',
  },
  {
    name: 'Pro', planKey: 'PRO',
    features: ['Unlimited products', 'Unlimited customers', 'Unlimited collection links', 'WhatsApp automation', '500 try-on credits/month', 'Multi-staff access', 'Campaign system', 'Dedicated support'],
    highlight: false, cta: 'Start Free Trial',
  },
]

const FAQS: FaqItem[] = [
  { q: 'Do I need a website to use Kanchuki?', a: 'No. Kanchuki works entirely through WhatsApp links. Your customers browse collections on a mobile web page — no app, no website, no tech setup needed.' },
  { q: 'How does the AI auto-tagging work?', a: 'Take one photo of any product. Our AI reads category, color, fabric, pattern, neck style, and sleeve type — all in about 8 seconds. You review and save. Built for Indian ethnic wear vocabulary.' },
  { q: 'Can I try it free?', a: 'Yes. 14-day free trial on any plan. No credit card required. You only pay after the trial ends.' },
  { q: 'What payment methods do you accept?', a: 'All major UPI apps (Google Pay, PhonePe, PayTM), credit/debit cards, and netbanking. Everything in INR — no hidden forex charges.' },
  { q: 'Is my data safe?', a: 'Yes. Customer photos and data are encrypted at rest and in transit. We never share or sell customer data. You can delete any product or customer photo at any time.' },
  { q: 'What if I need help setting up?', a: 'We offer WhatsApp-based onboarding support. Our team helps you upload your first 50 products and create your first collection link. Just tap the support chat in the app.' },
]

// ── Services marquee — the Colabs signature ────────────────────────
// Infinite auto-scrolling row of solid color-chip cards, one per capability.

interface Service {
  icon: LucideIcon
  title: string
  desc: string
  accent: ColorAccent
  href: string
}

const SERVICES: Service[] = [
  { icon: Camera, title: 'AI Catalog Builder', desc: 'Snap a photo. AI writes the catalog entry — name, category, colour, fabric, SKU.', accent: 'cobalt', href: '/for-retailers' },
  { icon: Share2, title: 'WhatsApp Collections', desc: 'Pick products, get a link, share on WhatsApp. Customers browse and enquire.', accent: 'volt', href: '/for-customers' },
  { icon: Heart, title: 'Fashion DNA CRM', desc: 'Know each customer\'s colour, style and budget. Suggest what they\'ll love.', accent: 'iris', href: '/for-retailers' },
  { icon: Search, title: 'In-Store AI Search', desc: '"Pink cotton suit under ₹2000" — find any product in seconds.', accent: 'terracotta', href: '/for-retailers' },
  { icon: Package, title: 'Bulk Onboarding', desc: '3,000 SKUs from a supplier PDF? Import, detect, done. No typing.', accent: 'moss', href: '/for-retailers' },
  { icon: QrCode, title: 'Store Page & QR', desc: 'A free storefront at your own link, plus a QR code for the counter.', accent: 'mint', href: '/for-customers' },
  { icon: WifiOff, title: 'Offline-First', desc: 'Built for patchy networks — updates queue up and sync when back online.', accent: 'sandal', href: '/how-it-works' },
  { icon: BarChart3, title: 'Virtual Try-On', desc: 'Customers see outfits on their own photo. Coming soon to all plans.', accent: 'fern', href: '/pricing' },
]

function ServicesMarquee() {
  return (
    <div className="bg-cream pb-16 sm:pb-20 lg:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 sm:mb-12">
        <AnimatedSection>
          <SectionHeader
            tag="Our Services"
            title="Everything a shop needs, on one phone."
            subtitle="Five capabilities, one platform — no stitching together WhatsApp, Excel, and a camera app."
          />
        </AnimatedSection>
      </div>
      <Marquee>
        {SERVICES.map((service) => (
          <Link key={service.title} href={service.href} className="group block w-[300px] sm:w-[360px] shrink-0 pr-5">
            <div className={`rounded-3xl p-7 sm:p-8 h-[260px] flex flex-col ${ACCENT_BG[service.accent]} ${ACCENT_TEXT[service.accent]} transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_48px_-16px_rgba(6,6,6,0.5)]`}>
              <service.icon size={28} strokeWidth={1.5} className="mb-auto" />
              <h3 className="font-display text-2xl font-semibold leading-tight mb-2">{service.title}</h3>
              <p className={`text-sm leading-relaxed mb-5 ${ACCENT_SUBTLE[service.accent]}`}>{service.desc}</p>
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${ACCENT_TEXT[service.accent]} transition-transform duration-300 group-hover:translate-x-1`}>
                Learn more <ArrowRight size={16} strokeWidth={1.5} />
              </span>
            </div>
          </Link>
        ))}
      </Marquee>
    </div>
  )
}

// ── Stats Bar ──────────────────────────────────────────────────────

function StatsBar() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [liveStats, setLiveStats] = useState<{ total_products: number; total_collections: number; total_retailers: number; enquiries_this_month: number } | null>(null)

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/public/stats`)
      .then((r) => r.json())
      .then((res) => { if (res?.data?.total_retailers > 0) setLiveStats(res.data) })
      .catch(() => {})
  }, [])

  const hasData = liveStats && liveStats.total_retailers > 0
  // Honesty gate (docs/content/pages/content-style-guide.md): live numbers
  // only. If the stats API is unreachable or empty, show the label with a
  // dash — never a fabricated count.
  const stats = [
    { label: 'Products digitized', value: hasData ? liveStats!.total_products.toLocaleString('en-IN') : '—', icon: Shirt },
    { label: 'Collection links shared', value: hasData ? liveStats!.total_collections.toLocaleString('en-IN') : '—', icon: Share2 },
    { label: 'Retailers onboarded', value: hasData ? liveStats!.total_retailers.toLocaleString('en-IN') : '—', icon: Store },
    { label: 'Customer enquiries this month', value: hasData ? liveStats!.enquiries_this_month.toLocaleString('en-IN') : '—', icon: MessageCircle },
  ]

  return (
    <div className="bg-white border-y border-carbon/10" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={fadeUp} className="text-center">
              <stat.icon size={24} strokeWidth={1.5} className="mx-auto mb-2 text-cobalt-600" />
              <div className="font-display text-2xl sm:text-3xl font-semibold text-carbon tabular-nums">{stat.value}</div>
              <div className="text-sm text-carbon/50 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ── Features ───────────────────────────────────────────────────────
// Solid color-chip grid — one saturated block per capability, like Colabs'
// modular service modules.

const FEATURES: { icon: LucideIcon; title: string; desc: string; accent: ColorAccent; span: string; comingSoon?: boolean }[] = [
  { icon: Camera, title: 'AI Catalog Builder', desc: 'Snap a photo. AI tags category, color, and fabric automatically. Your entire shop digitized in hours, not weeks.', accent: 'cobalt', span: 'sm:col-span-4 lg:col-span-7' },
  { icon: Share2, title: 'WhatsApp Collections', desc: 'Select products, generate a link, share on WhatsApp. Customers browse, heart favorites, and enquire — no app download needed.', accent: 'volt', span: 'sm:col-span-2 lg:col-span-5' },
  { icon: Heart, title: 'Fashion DNA CRM', desc: 'Know what each customer loves. Capture color, style, and budget preferences. AI suggests the perfect products for every customer.', accent: 'iris', span: 'sm:col-span-2 lg:col-span-4' },
  { icon: Search, title: 'In-Store AI Search', desc: '"Pink cotton suit under ₹2000" — find any product in seconds. Natural language search understands Hindi-transliterated terms too.', accent: 'terracotta', span: 'sm:col-span-2 lg:col-span-4' },
  { icon: BarChart3, title: 'Virtual Try-On', desc: 'Customers upload a photo and see how outfits look on them. No mirror needed. Coming soon to all plans.', accent: 'fern', comingSoon: true, span: 'sm:col-span-2 lg:col-span-4' },
]

function FeaturesSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <Section id="features" className="bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="How We Help" title="Everything you need to run your clothing store" subtitle="Five capabilities — one platform. No stitching together WhatsApp, Excel, and a camera app." />
        </AnimatedSection>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid sm:grid-cols-4 lg:grid-cols-12 gap-5 sm:gap-6">
          {FEATURES.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp} className={feature.span}>
              <ColorCard accent={feature.accent} className="group h-full p-6 sm:p-8">
                <feature.icon size={26} strokeWidth={1.5} className={`mb-5 ${ACCENT_TEXT[feature.accent]}`} />
                <h3 className={`font-display text-lg font-semibold mb-2 ${ACCENT_TEXT[feature.accent]}`}>
                  {feature.title}
                  {feature.comingSoon && <span className={`ml-2 text-xs font-medium ${feature.accent === 'fern' ? 'bg-carbon/10 text-carbon/70' : 'bg-white/20 text-white/80'} px-2 py-0.5 rounded-full`}>Coming soon</span>}
                </h3>
                <p className={`text-sm leading-relaxed ${ACCENT_SUBTLE[feature.accent]}`}>{feature.desc}</p>
              </ColorCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

// ── How It Works ───────────────────────────────────────────────────

const HOW_IT_WORKS = [
  { step: '01', title: 'Snap & Tag', desc: 'Take a photo of any product in your store. AI extracts category, color, and fabric in seconds. No manual data entry.', icon: Camera },
  { step: '02', title: 'Select & Share', desc: 'Pick 10–20 products, add a title, and generate a WhatsApp link. Send it to customers in one tap or broadcast to everyone at once.', icon: Share2 },
  { step: '03', title: 'Sell More', desc: 'Customers browse your collection, save favorites, and enquire via WhatsApp. Track views, enquiries, and conversion — all in your dashboard.', icon: BarChart3 },
]

function HowItWorks() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <Section id="how-it-works" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="How It Works" title="Three steps. No tech skills needed." subtitle="From photo to WhatsApp — faster than your customer can say 'yeh kitne ka hai?'" />
        </AnimatedSection>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid sm:grid-cols-3 gap-8 sm:gap-12 relative">
          <div className="hidden sm:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-carbon/10" />
          {HOW_IT_WORKS.map((item, i) => (
            <motion.div key={item.step} variants={fadeUp} className="relative text-center">
              <div className={`relative z-10 w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 overflow-hidden rounded-2xl flex items-center justify-center ${i === 0 ? 'bg-cobalt-600' : i === 1 ? 'bg-volt' : 'bg-iris'}`}>
                <item.icon size={26} strokeWidth={1.5} className={i === 1 ? 'text-carbon' : 'text-white'} />
              </div>
              <div className="font-display text-xs font-semibold text-cobalt-600 mb-2 tracking-[0.22em]">STEP {item.step}</div>
              <h3 className="font-display text-lg font-semibold text-carbon mb-3">{item.title}</h3>
              <p className="text-sm text-carbon/60 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

// ── Comparison Matrix ──────────────────────────────────────────────

function ComparisonMatrix() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const rows = [
    { name: 'TryOnCloud / AI Vastra', cols: [true, false, false, false] },
    { name: 'Interakt / Meon CRM', cols: [false, false, true, false] },
    { name: 'DigifyERP', cols: [false, false, false, false] },
    { name: 'WhatsApp + Google Sheets', cols: [false, false, false, true] },
  ]
  const headers = ['AI Try-On', 'Fashion DNA CRM', 'WhatsApp Commerce', 'No Website Needed']

  return (
    <Section className="bg-cream">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="The Kanchuki Moat" title="The only platform that has it all" subtitle="Competitors have one piece. Kanchuki has all five." />
        </AnimatedSection>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={fadeUp} className="overflow-x-auto rounded-2xl border border-carbon/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-carbon/10 bg-cream">
                <th className="text-left px-5 py-4 text-carbon/50 font-medium text-xs uppercase tracking-wider">Platform</th>
                {headers.map((h) => <th key={h} className="px-4 py-4 text-center text-carbon/50 font-medium text-xs uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-carbon/10 hover:bg-cream/70 transition-colors">
                  <td className="px-5 py-4 text-carbon/70 font-medium">{row.name}</td>
                  {row.cols.map((v, i) => <td key={i} className="px-4 py-4 text-center text-lg">{v ? <span className="text-cobalt-600">✓</span> : <span className="text-carbon/25">–</span>}</td>)}
                </tr>
              ))}
              <tr className="bg-volt/30">
                <td className="px-5 py-4 font-semibold text-carbon">Kanchuki</td>
                {[true, true, true, true].map((_, i) => <td key={i} className="px-4 py-4 text-center text-lg font-semibold text-cobalt-700">✓</td>)}
              </tr>
            </tbody>
          </table>
        </motion.div>
      </div>
    </Section>
  )
}

// ── Store Directory Teaser ─────────────────────────────────────────

interface TeaserStore {
  public_slug: string
  shop_name: string
  city: string | null
  logo_url: string | null
  product_count: number
  is_featured: boolean
}

function StoreTeaser() {
  const [stores, setStores] = useState<TeaserStore[] | null>(null)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/public/stores?pageSize=6`)
      .then((r) => r.json())
      .then((res) => {
        if (Array.isArray(res?.data?.stores)) setStores(res.data.stores)
      })
      .catch(() => {})
  }, [])

  const count = stores?.length ?? 0
  const showBeFirst = stores !== null && count < 3

  return (
    <Section id="store-directory" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="Real Stores"
            title="Shop real stores on Kanchuki."
            subtitle="Every store here is a real shop with a real owner you can message. Browse by city, or search for a specific store."
          />
        </AnimatedSection>

        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {(stores ?? []).slice(0, 6).map((s) => (
            <motion.div key={s.public_slug} variants={fadeUp}>
              <ColorCard accent="cobalt" className="group h-full">
                <Link href={`/${s.public_slug}`} className="block p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/20 bg-white/10 mb-4">
                      <StoreLogo shopName={s.shop_name} logoUrl={s.logo_url} />
                    </div>
                    {s.is_featured && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-carbon bg-volt px-2 py-1 rounded-full">
                        <Star size={11} strokeWidth={1.5} className="fill-carbon text-carbon" />
                        Featured
                      </span>
                    )}
                  </div>
                  <h3 className="font-display font-semibold text-white mb-1 group-hover:text-volt transition-colors">{s.shop_name}</h3>
                  <p className="text-sm text-white/70 mb-4 flex items-center gap-1.5">
                    <MapPin size={14} strokeWidth={1.5} className="text-white/50" />
                    {s.city ?? 'India'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">
                      {s.product_count.toLocaleString('en-IN')} product{s.product_count === 1 ? '' : 's'}
                    </span>
                    <span className="text-sm font-semibold text-volt group-hover:text-white transition-colors">Visit store →</span>
                  </div>
                </Link>
              </ColorCard>
            </motion.div>
          ))}
        </motion.div>

        {showBeFirst && (
          <div className="text-center py-12">
            <p className="font-display text-lg font-semibold text-carbon mb-2">Be the first store on Kanchuki</p>
            <p className="text-carbon/60 text-sm max-w-md mx-auto mb-6">
              Stores appear here as they complete onboarding — every listing is a real shop with a real catalog.
            </p>
            <Link
              href="/pricing"
              className="inline-flex bg-volt text-carbon text-sm font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition active:scale-[0.97]"
            >
              Start your 14-day free trial
            </Link>
          </div>
        )}

        <div className="text-center mt-10">
          <Link href="/stores" className="inline-flex items-center gap-2 text-sm font-semibold text-cobalt-600 hover:text-cobalt-700 transition-colors">
            Explore all stores
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </Section>
  )
}

// ── Testimonials ───────────────────────────────────────────────────

function TestimonialsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const testimonials = [
    { quote: "Waiting for pilot retailers to share their experience. This space will feature real stories from Indian clothing stores using Kanchuki.", name: '— Coming soon', role: '' },
    { quote: "Our pilot program is running. If you're a retailer interested in early access and willing to share feedback, reach out to us.", name: '— Join the pilot', role: 'support@kanchuki.app' },
    { quote: 'Real retailers. Real results. Real stories — coming after our first 10 pilot participants complete onboarding.', name: '— Pilot in progress', role: '' },
  ]

  return (
    <Section className="bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="Testimonials" title="What retailers say" subtitle="Real feedback from our pilot program." />
        </AnimatedSection>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid sm:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} variants={fadeUp}>
              {/* No star rating here — these are honest "coming soon"
                  placeholders, not real reviews. */}
              <div className={`h-1.5 rounded-t-2xl ${i === 0 ? 'bg-cobalt-600' : i === 1 ? 'bg-volt' : 'bg-terracotta'}`} />
              <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-carbon/10 border-t-0 p-6 sm:p-8">
                <p className="font-display text-4xl leading-none text-cobalt-600 mb-3">&ldquo;</p>
                <p className="text-sm text-carbon/70 leading-relaxed mb-6">{t.quote}</p>
                <div className="border-t border-carbon/10 pt-4">
                  <div className="text-sm font-semibold text-carbon">{t.name}</div>
                  <div className="text-xs text-carbon/40">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <div className="text-center mt-8">
          <Link href="/testimonials" className="text-sm font-semibold text-cobalt-600 hover:text-cobalt-700 transition-colors">See how retailer stories get verified &rarr;</Link>
        </div>
      </div>
    </Section>
  )
}

// ── Pricing ────────────────────────────────────────────────────────

function PricingSection() {
  const [period, setPeriod] = useState<Period>('monthly')
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const [pricing, setPricing] = useState(
    PLAN_PRICING as Record<'STARTER' | 'GROWTH' | 'PRO', { monthly: number; annual: number }>,
  )

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/public/pricing`)
      .then((r) => r.json())
      .then((res) => {
        const rows: { plan: 'STARTER' | 'GROWTH' | 'PRO'; monthly: number; annual: number }[] = res?.data ?? []
        if (rows.length === 0) return
        setPricing(Object.fromEntries(rows.map((r) => [r.plan, { monthly: r.monthly, annual: r.annual }])) as Record<
          'STARTER' | 'GROWTH' | 'PRO',
          { monthly: number; annual: number }
        >)
      })
      .catch(() => {})
  }, [])

  return (
    <Section id="pricing" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="Pricing" title="Simple pricing in INR" subtitle="No hidden costs. Pay via UPI, cards, or netbanking. 14-day free trial on any plan." />
        </AnimatedSection>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.4, delay: 0.2 }} className="flex items-center justify-center gap-4 mb-10">
          <button onClick={() => setPeriod('monthly')} className={`text-sm font-medium transition-colors ${period === 'monthly' ? 'text-carbon' : 'text-carbon/40'}`}>Monthly</button>
          <button onClick={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')} className={`relative w-12 h-6 rounded-full transition-colors ${period === 'annual' ? 'bg-cobalt-600' : 'bg-carbon/20'}`} aria-label="Toggle billing period">
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${period === 'annual' ? 'translate-x-6' : ''}`} />
          </button>
          <button onClick={() => setPeriod('annual')} className={`text-sm font-medium transition-colors ${period === 'annual' ? 'text-carbon' : 'text-carbon/40'}`}>Annual <span className="text-cobalt-600 font-semibold">(Save 20%)</span></button>
        </motion.div>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="grid sm:grid-cols-3 gap-6 lg:gap-8">
          {PLANS.map((plan) => {
            const planPricing = pricing[plan.planKey]
            const price = (period === 'monthly' ? planPricing.monthly : planPricing.annual) / 100
            const periodLabel = period === 'monthly' ? '/mo' : '/yr'
            return (
              <motion.div key={plan.name} variants={fadeUp} className={`relative rounded-2xl p-6 sm:p-8 border transition-all duration-300 ${plan.highlight ? 'border-carbon bg-carbon text-cream shadow-[0_20px_48px_-16px_rgba(6,6,6,0.5)]' : 'border-carbon/10 bg-white hover:border-carbon/25 hover:-translate-y-0.5'}`}>
                {plan.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-volt text-carbon text-xs font-semibold px-4 py-1 rounded-full">MOST POPULAR</div>}
                <h3 className={`font-display text-xl font-semibold mb-1 ${plan.highlight ? 'text-cream' : 'text-carbon'}`}>{plan.name}</h3>
                <div className={`font-display text-3xl sm:text-4xl font-semibold mb-1 ${plan.highlight ? 'text-cream' : 'text-carbon'}`}>
                  <span className="inline-flex items-center"><IndianRupee size={22} strokeWidth={1.5} className={plan.highlight ? 'text-cream/80' : 'text-carbon/40'} />{price.toLocaleString('en-IN')}</span>
                  <span className={`text-base font-normal ${plan.highlight ? 'text-cream/60' : 'text-carbon/40'}`}>{periodLabel}</span>
                </div>
                <div className={`text-sm mb-6 ${plan.highlight ? 'text-cream/60' : 'text-carbon/40'}`}>
                  {period === 'annual' ? `₹${(planPricing.annual / 12 / 100).toLocaleString('en-IN')}/mo billed annually` : `₹${(planPricing.monthly / 100).toLocaleString('en-IN')}/mo billed monthly`}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={16} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-volt' : 'text-cobalt-600'}`} />
                      <span className={plan.highlight ? 'text-cream/90' : 'text-carbon/70'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href="#cta" className={`block text-center py-3.5 rounded-full font-semibold transition active:scale-[0.97] ${plan.highlight ? 'bg-volt text-carbon hover:bg-volt-600' : 'bg-carbon text-cream hover:bg-carbon-50'}`}>{plan.cta}</a>
              </motion.div>
            )
          })}
        </motion.div>
        <p className="text-center text-sm text-carbon/40 mt-8">All plans include a 14-day free trial. No credit card required. Prices include GST.</p>
      </div>
    </Section>
  )
}

// ── FAQ ────────────────────────────────────────────────────────────

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <Section id="faq" className="bg-cream">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader tag="FAQ" title="Frequently asked questions" subtitle="Everything you need to know about Kanchuki." />
        </AnimatedSection>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger} className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div key={i} variants={fadeUp} className={`bg-white rounded-2xl border transition-colors duration-300 ${openIndex === i ? 'border-cobalt-500' : 'border-carbon/10 hover:border-carbon/25'}`}>
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500 focus-visible:ring-offset-2 rounded-2xl" aria-expanded={openIndex === i} aria-controls={`faq-panel-${i}`}>
                <span className="text-sm font-semibold text-carbon pr-4">{faq.q}</span>
                <ChevronDown size={18} strokeWidth={1.5} className={`text-carbon/40 shrink-0 transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden" id={`faq-panel-${i}`} role="region">
                    <div className="px-6 pb-5 text-sm text-carbon/60 leading-relaxed border-t border-carbon/10 pt-4">{faq.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

// ── Final CTA ──────────────────────────────────────────────────────

function CtaSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  return (
    <Section id="cta" dark>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center" ref={ref}>
        <motion.div initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={stagger}>
          <motion.h2 variants={fadeUp} className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-balance">Ready to digitize your store?</motion.h2>
          <motion.p variants={fadeUp} className="mt-5 text-lg sm:text-xl text-cream/60 max-w-2xl mx-auto">Join Indian clothing retailers already using Kanchuki. 14-day free trial. No credit card needed.</motion.p>
          <motion.div variants={fadeUp} className="mt-8 sm:mt-10 flex flex-col items-center gap-3 justify-center">
            {/* Only Android exists today (EAS-distributed APK) — Play Store
                and App Store are not live, so we don't claim they are. */}
            <Link href="/download" className="inline-flex items-center justify-center gap-3 bg-volt text-carbon px-6 sm:px-8 py-4 rounded-full hover:bg-volt-600 transition font-semibold active:scale-[0.97]">
              <Smartphone size={22} strokeWidth={1.5} />
              <div className="text-left">
                <div className="text-xs text-carbon/60 font-normal">Download for</div>
                <div className="font-semibold">Android</div>
              </div>
            </Link>
            <p className="text-xs text-cream/40">Play Store &amp; iOS — coming soon</p>
          </motion.div>
          <motion.div variants={fadeUp} className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-cream/50">
            <Link href="#features" className="hover:text-volt transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-volt transition-colors">Pricing</Link>
            <Link href="#faq" className="hover:text-volt transition-colors">FAQ</Link>
            <Link href="/contact" className="hover:text-volt transition-colors">Contact</Link>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  )
}

// ── All below-hero sections as a single export ────────────────────

export default function MarketingSections() {
  return (
    <>
      <ServicesMarquee />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <ComparisonMatrix />
      <StoreTeaser />
      <TestimonialsSection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
      <Footer />
    </>
  )
}
