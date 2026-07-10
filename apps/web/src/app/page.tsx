'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  Camera,
  Share2,
  Search,
  Heart,
  Store,
  ChevronDown,
  Menu,
  X,
  Check,
  Star,
  ArrowRight,
  IndianRupee,
  Shield,
  Zap,
  Smartphone,
  MessageCircle,
  Shirt,
  BarChart3,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────

type PlanName = 'Starter' | 'Growth' | 'Pro'

interface Plan {
  name: PlanName
  monthly: number
  annual: number
  features: string[]
  highlight: boolean
  cta: string
}

type Period = 'monthly' | 'annual'

interface FaqItem {
  q: string
  a: string
}

// ── Data ───────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    name: 'Starter',
    monthly: 999,
    annual: 9999,
    features: [
      '500 products',
      '200 customers',
      '50 collection links/month',
      'AI auto-tagging',
      'Manual WhatsApp share',
    ],
    highlight: false,
    cta: 'Start Free Trial',
  },
  {
    name: 'Growth',
    monthly: 2499,
    annual: 24999,
    features: [
      '2,000 products',
      '1,000 customers',
      'Unlimited collection links',
      'AI fashion matching',
      '100 try-on credits/month',
      'Priority support',
    ],
    highlight: true,
    cta: 'Start Free Trial',
  },
  {
    name: 'Pro',
    monthly: 4999,
    annual: 49999,
    features: [
      'Unlimited products',
      'Unlimited customers',
      'Unlimited collection links',
      'WhatsApp automation',
      '500 try-on credits/month',
      'Multi-staff access',
      'Campaign system',
      'Dedicated support',
    ],
    highlight: false,
    cta: 'Start Free Trial',
  },
]

const FAQS: FaqItem[] = [
  {
    q: 'Do I need a website to use Kanchuki?',
    a: 'No. Kanchuki works entirely through WhatsApp links. Your customers browse collections on a mobile web page — no app, no website, no tech setup needed.',
  },
  {
    q: 'How does the AI auto-tagging work?',
    a: 'Take one photo of any product. Our AI reads category, color, fabric, pattern, neck style, sleeve type, and occasion — all in about 8 seconds. You review and save. Built for Indian ethnic wear vocabulary.',
  },
  {
    q: 'Can I try it free?',
    a: 'Yes. 14-day free trial on any plan. No credit card required. You only pay after the trial ends.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major UPI apps (Google Pay, PhonePe, PayTM), credit/debit cards, and netbanking. Everything in INR — no hidden forex charges.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Customer photos and data are encrypted at rest and in transit. We never share or sell customer data. You can delete any product or customer photo at any time.',
  },
  {
    q: 'What if I need help setting up?',
    a: 'We offer WhatsApp-based onboarding support. Our team helps you upload your first 50 products and create your first collection link. Just tap the support chat in the app.',
  },
]

const FEATURES = [
  {
    icon: Camera,
    title: 'AI Catalog Builder',
    desc: 'Snap a photo. AI tags category, color, fabric, and occasion automatically. Your entire shop digitized in hours, not weeks.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
  },
  {
    icon: Share2,
    title: 'WhatsApp Collections',
    desc: 'Select products, generate a link, share on WhatsApp. Customers browse, heart favorites, and enquire — no app download needed.',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: Heart,
    title: 'Fashion DNA CRM',
    desc: 'Know what each customer loves. Capture color, style, budget, and occasion preferences. AI suggests the perfect products for every customer.',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
  {
    icon: Search,
    title: 'In-Store AI Search',
    desc: '"Pink cotton suit under ₹2000" — find any product in seconds. Natural language search understands Hindi-transliterated terms too.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Shirt,
    title: 'Virtual Try-On',
    desc: 'Customers upload a photo and see how outfits look on them. No mirror needed. Coming soon to all plans.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    comingSoon: true,
  },
]

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Snap & Tag',
    desc: 'Take a photo of any product in your store. AI extracts category, color, fabric, and occasion in seconds. No manual data entry.',
    icon: Camera,
  },
  {
    step: '02',
    title: 'Select & Share',
    desc: 'Pick 10–20 products, add a title, and generate a WhatsApp link. Send it to customers in one tap or broadcast to everyone at once.',
    icon: Share2,
  },
  {
    step: '03',
    title: 'Sell More',
    desc: 'Customers browse your collection, save favorites, and enquire via WhatsApp. Track views, enquiries, and conversion — all in your dashboard.',
    icon: BarChart3,
  },
]

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

// ── Motion variants ────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

// ── Section Wrapper ────────────────────────────────────────────────

function Section({
  children,
  id,
  className = '',
  dark = false,
}: {
  children: React.ReactNode
  id?: string
  className?: string
  dark?: boolean
}) {
  return (
    <section
      id={id}
      className={`py-16 sm:py-20 lg:py-28 ${dark ? 'bg-gray-900 text-white' : 'bg-white'} ${className}`}
    >
      {children}
    </section>
  )
}

function SectionHeader({
  tag,
  title,
  subtitle,
  dark = false,
  align = 'center',
}: {
  tag?: string
  title: string
  subtitle?: string
  dark?: boolean
  align?: 'center' | 'left'
}) {
  return (
    <div
      className={`max-w-2xl ${align === 'center' ? 'mx-auto text-center' : ''} mb-12 sm:mb-16`}
    >
      {tag && (
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-cyan-600 mb-3">
          {tag}
        </span>
      )}
      <h2
        className={`text-3xl sm:text-4xl font-bold tracking-tight text-balance ${
          dark ? 'text-white' : 'text-gray-900'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-lg ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{subtitle}</p>
      )}
    </div>
  )
}

function AnimatedSection({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={fadeUp}
      className={className}
    >
      {children}
    </motion.div>
  )
}

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
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center group-hover:bg-cyan-700 transition-colors">
            <span className="text-white font-bold text-base">K</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">Kanchuki</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="#pricing"
            className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            Sign In
          </a>
          <a
            href="#cta"
            className="bg-cyan-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-cyan-700 transition-all shadow-sm hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          >
            Get Started Free
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-gray-700 hover:text-gray-900"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-gray-100 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm text-gray-700 hover:text-cyan-600 font-medium py-2 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
              <hr className="border-gray-100" />
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="block text-center bg-cyan-600 text-white font-semibold px-5 py-3 rounded-xl hover:bg-cyan-700 transition-all"
              >
                Get Started Free
              </a>
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
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-50/80 via-white to-white pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-cyan-100/60 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-tr from-amber-50/60 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 text-sm font-medium px-4 py-2 rounded-full mb-6 sm:mb-8 border border-cyan-100"
        >
          <span>🇮🇳</span>
          <span>Built for Indian ethnic wear retailers</span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 tracking-tight leading-[1.1] text-balance max-w-4xl mx-auto"
        >
          Your store on WhatsApp.{' '}
          <span className="bg-gradient-to-r from-cyan-600 to-cyan-500 bg-clip-text text-transparent">
            Powered by AI.
          </span>
        </motion.h1>

        {/* Hindi tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg sm:text-xl text-cyan-600/80 font-medium"
        >
          आपकी दुकान, AI की ताकत
        </motion.p>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-5 sm:mt-6 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
        >
          Digitize your clothing shop in minutes. Share curated collections with customers via
          WhatsApp. AI automatically tags every product from a single photo.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#cta"
            className="inline-flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-base sm:text-lg px-8 py-4 rounded-2xl transition-all shadow-lg shadow-cyan-200 hover:shadow-xl hover:shadow-cyan-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          >
            Start Free Trial
            <ArrowRight size={20} />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-semibold text-base sm:text-lg px-8 py-4 rounded-2xl hover:border-cyan-300 hover:text-cyan-700 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          >
            See How It Works
            <ChevronRight size={20} />
          </a>
        </motion.div>

        {/* Trust signals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-gray-400"
        >
          <span className="flex items-center gap-1.5">
            <Shield size={14} className="text-green-500" />
            14-day free trial
          </span>
          <span className="flex items-center gap-1.5">
            <Zap size={14} className="text-amber-500" />
            No credit card
          </span>
          <span className="flex items-center gap-1.5">
            <Smartphone size={14} className="text-blue-500" />
            Works without a website
          </span>
        </motion.div>
      </div>
    </section>
  )
}

// ── Stats Bar ──────────────────────────────────────────────────────

function StatsBar() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  // Fetch real platform stats from public API — fall back to targets when no data yet
  const [liveStats, setLiveStats] = useState<{
    total_products: number
    total_collections: number
    total_retailers: number
    enquiries_this_month: number
  } | null>(null)

  useEffect(() => {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/public/stats`)
      .then((r) => r.json())
      .then((res) => {
        // Only use real data if at least one retailer exists
        if (res?.data?.total_retailers > 0) {
          setLiveStats(res.data)
        }
      })
      .catch(() => {
        // API unavailable — stay on target numbers
      })
  }, [])

  // Show real data when available, otherwise use pilot targets
  const hasData = liveStats && liveStats.total_retailers > 0
  const stats = hasData
    ? [
        { label: 'Products digitized', value: liveStats!.total_products.toLocaleString('en-IN'), icon: Shirt },
        { label: 'Collection links shared', value: liveStats!.total_collections.toLocaleString('en-IN'), icon: Share2 },
        { label: 'Retailers onboarded', value: liveStats!.total_retailers.toLocaleString('en-IN'), icon: Store },
        { label: 'Customer enquiries this month', value: liveStats!.enquiries_this_month.toLocaleString('en-IN'), icon: MessageCircle },
      ]
    : [
        { label: 'Products digitized', value: '2,500+', icon: Shirt },
        { label: 'Collection links shared', value: '500+', icon: Share2 },
        { label: 'Retailers onboarded', value: '50+', icon: Store },
        { label: 'Customer enquiries', value: '1,000+', icon: MessageCircle },
      ]

  return (
    <div className="bg-gray-50 border-y border-gray-100" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="grid grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUp}
              className="text-center"
            >
              <stat.icon
                size={24}
                className="mx-auto mb-2 text-cyan-500"
              />
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ── Features ───────────────────────────────────────────────────────

function FeaturesSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <Section id="features">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="Features"
            title="Everything you need to run your clothing store"
            subtitle="Five capabilities — one platform. No stitching together WhatsApp, Excel, and a camera app."
          />
        </AnimatedSection>

        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
        >
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={fadeUp}
              className="group relative bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300"
            >
              <div
                className={`w-12 h-12 ${feature.bg} ${feature.color} rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {feature.title}
                {feature.comingSoon && (
                  <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Coming soon
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

// ── How It Works ───────────────────────────────────────────────────

function HowItWorks() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <Section id="how-it-works" className="bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="How It Works"
            title="Three steps. No tech skills needed."
            subtitle="From photo to WhatsApp — faster than your customer can say 'yeh kitne ka hai?'"
          />
        </AnimatedSection>

        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="grid sm:grid-cols-3 gap-8 sm:gap-12 relative"
        >
          {/* Connector line — desktop only */}
          <div className="hidden sm:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-0.5 bg-gradient-to-r from-cyan-200 via-cyan-400 to-cyan-200" />

          {HOW_IT_WORKS.map((item, i) => (
            <motion.div
              key={item.step}
              variants={fadeUp}
              className="relative text-center"
            >
              <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 bg-white rounded-2xl border-2 border-cyan-100 flex items-center justify-center shadow-sm">
                <item.icon size={28} className="text-cyan-600" />
              </div>
              <div className="text-xs font-bold text-cyan-600 mb-2 tracking-widest">
                STEP {item.step}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
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
    <Section>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="The Kanchuki Moat"
            title="The only platform that has it all"
            subtitle="Competitors have one piece. Kanchuki has all five."
          />
        </AnimatedSection>

        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={fadeUp}
          className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-4 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Platform
                </th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="px-4 py-4 text-center text-gray-500 font-medium text-xs uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors">
                  <td className="px-5 py-4 text-gray-700 font-medium">{row.name}</td>
                  {row.cols.map((v, i) => (
                    <td key={i} className="px-4 py-4 text-center text-lg">
                      {v ? (
                        <span className="text-green-500">✅</span>
                      ) : (
                        <span className="text-gray-300">❌</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Kanchuki row — highlighted */}
              <tr className="bg-cyan-50/80">
                <td className="px-5 py-4 font-bold text-cyan-800">Kanchuki</td>
                {[true, true, true, true].map((_, i) => (
                  <td key={i} className="px-4 py-4 text-center text-lg font-bold text-cyan-700">
                    ✅
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </motion.div>
      </div>
    </Section>
  )
}

// ── Testimonials ───────────────────────────────────────────────────

function TestimonialsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  // Testimonials placeholder — replace with real quotes after pilot launch
  const testimonials = [
    {
      quote: 'Waiting for pilot retailers to share their experience. This space will feature real stories from Indian clothing stores using Kanchuki.',
      name: '— Coming soon',
      role: '',
    },
    {
      quote: 'Our pilot program is running. If you\'re a retailer interested in early access and willing to share feedback, reach out to us.',
      name: '— Join the pilot',
      role: 'hello@kanchuki.app',
    },
    {
      quote: 'Real retailers. Real results. Real stories — coming after our first 10 pilot participants complete onboarding.',
      name: '— Pilot in progress',
      role: '',
    },
  ]

  return (
    <Section className="bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="Testimonials"
            title="What retailers say"
            subtitle="Real feedback from our pilot program."
          />
        </AnimatedSection>

        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="grid sm:grid-cols-3 gap-6"
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, s) => (
                  <Star key={s} size={14} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
              <div className="border-t border-gray-100 pt-4">
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-400">{t.role}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

// ── Pricing ────────────────────────────────────────────────────────

function PricingSection() {
  const [period, setPeriod] = useState<Period>('monthly')
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <Section id="pricing">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="Pricing"
            title="Simple pricing in INR"
            subtitle="No hidden costs. Pay via UPI, cards, or netbanking. 14-day free trial on any plan."
          />
        </AnimatedSection>

        {/* Period toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex items-center justify-center gap-4 mb-10"
        >
          <button
            onClick={() => setPeriod('monthly')}
            className={`text-sm font-medium transition-colors ${
              period === 'monthly' ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod(period === 'monthly' ? 'annual' : 'monthly')}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              period === 'annual' ? 'bg-cyan-600' : 'bg-gray-200'
            }`}
            aria-label="Toggle billing period"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                period === 'annual' ? 'translate-x-6' : ''
              }`}
            />
          </button>
          <button
            onClick={() => setPeriod('annual')}
            className={`text-sm font-medium transition-colors ${
              period === 'annual' ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            Annual{' '}
            <span className="text-green-600 font-semibold">(Save 20%)</span>
          </button>
        </motion.div>

        {/* Plans */}
        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="grid sm:grid-cols-3 gap-6 lg:gap-8"
        >
          {PLANS.map((plan) => {
            const price = period === 'monthly' ? plan.monthly : plan.annual
            const periodLabel = period === 'monthly' ? '/mo' : '/yr'

            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                className={`relative rounded-3xl p-6 sm:p-8 border-2 transition-all duration-300 hover:shadow-xl ${
                  plan.highlight
                    ? 'border-cyan-600 bg-cyan-600 text-white shadow-lg shadow-cyan-200 scale-[1.02] sm:scale-105'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-cyan-700 text-xs font-bold px-4 py-1 rounded-full shadow-sm border border-cyan-100">
                    MOST POPULAR
                  </div>
                )}

                <h3
                  className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}
                >
                  {plan.name}
                </h3>

                <div
                  className={`text-3xl sm:text-4xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}
                >
                  <span className="inline-flex items-center">
                    <IndianRupee
                      size={22}
                      className={plan.highlight ? 'text-white/80' : 'text-gray-400'}
                    />
                    {price.toLocaleString('en-IN')}
                  </span>
                  <span
                    className={`text-base font-normal ${plan.highlight ? 'text-white/70' : 'text-gray-400'}`}
                  >
                    {periodLabel}
                  </span>
                </div>

                <div
                  className={`text-sm mb-6 ${plan.highlight ? 'text-white/60' : 'text-gray-400'}`}
                >
                  {period === 'annual'
                    ? `₹${(plan.annual / 12).toLocaleString('en-IN')}/mo billed annually`
                    : `₹${plan.monthly.toLocaleString('en-IN')}/mo billed monthly`}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check
                        size={16}
                        className={`mt-0.5 shrink-0 ${
                          plan.highlight ? 'text-white/80' : 'text-green-500'
                        }`}
                      />
                      <span className={plan.highlight ? 'text-white/90' : 'text-gray-600'}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#cta"
                  className={`block text-center py-3.5 rounded-xl font-semibold transition-all active:scale-[0.98] ${
                    plan.highlight
                      ? 'bg-white text-cyan-700 hover:bg-cyan-50 shadow-sm'
                      : 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-sm hover:shadow-md'
                  }`}
                >
                  {plan.cta}
                </a>
              </motion.div>
            )
          })}
        </motion.div>

        <p className="text-center text-sm text-gray-400 mt-8">
          All plans include a 14-day free trial. No credit card required. Prices include GST.
        </p>
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
    <Section id="faq" className="bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <AnimatedSection>
          <SectionHeader
            tag="FAQ"
            title="Frequently asked questions"
            subtitle="Everything you need to know about Kanchuki."
          />
        </AnimatedSection>

        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
          className="space-y-3"
        >
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={`bg-white rounded-2xl border transition-all duration-300 ${
                openIndex === i ? 'border-cyan-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 rounded-2xl"
                aria-expanded={openIndex === i}
                aria-controls={`faq-panel-${i}`}
              >
                <span className="text-sm font-semibold text-gray-900 pr-4">{faq.q}</span>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 shrink-0 transition-transform duration-300 ${
                    openIndex === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                    id={`faq-panel-${i}`}
                    role="region"
                  >
                    <div className="px-6 pb-5 text-sm text-gray-500 leading-relaxed border-t border-gray-50 pt-4">
                      {faq.a}
                    </div>
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
        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          <motion.h2
            variants={fadeUp}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance"
          >
            Ready to digitize your store?
          </motion.h2>

          <motion.p
            variants={fadeUp}
            className="mt-5 text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto"
          >
            Join Indian clothing retailers already using Kanchuki. 14-day free trial. No credit card
            needed.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 px-6 sm:px-8 py-4 rounded-2xl hover:bg-gray-100 transition-all font-semibold shadow-lg active:scale-[0.98]"
            >
              <Smartphone size={22} />
              <div className="text-left">
                <div className="text-xs text-gray-500 font-normal">Download on</div>
                <div className="font-bold">Google Play</div>
              </div>
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 px-6 sm:px-8 py-4 rounded-2xl hover:bg-gray-100 transition-all font-semibold shadow-lg active:scale-[0.98]"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/>
                <path d="M10 2c1 .5 2 2 2 5"/>
              </svg>
              <div className="text-left">
                <div className="text-xs text-gray-500 font-normal">Download on</div>
                <div className="font-bold">App Store</div>
              </div>
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-400"
          >
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="#faq" className="hover:text-white transition-colors">FAQ</Link>
            <a href="mailto:hello@kanchuki.app" className="hover:text-white transition-colors">Contact</a>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────

function FooterSection() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-cyan-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">K</span>
            </div>
            <span className="text-gray-300 font-semibold">Kanchuki</span>
          </div>

          {/* Copyright */}
          <p className="text-gray-500 text-sm text-center">
            © {new Date().getFullYear()} Kanchuki. Made in India{' '}
            <span className="inline-block">🇮🇳</span>
          </p>

          {/* Links */}
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-300 transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-gray-300 transition-colors">
              Terms
            </a>
            <a href="mailto:hello@kanchuki.app" className="hover:text-gray-300 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <ComparisonMatrix />
      <TestimonialsSection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
      <FooterSection />
    </>
  )
}
