import type { Metadata } from 'next'
import { Smartphone, Camera, Share2, Search } from 'lucide-react'
import { Navbar, Footer, Section, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'

export const metadata: Metadata = {
  title: 'Kanchuki App — Android Early Access | Kanchuki',
  description:
    'The Kanchuki retailer app — photograph dresses, AI writes the catalog, share on WhatsApp. Android early access now, Play Store & iOS coming soon.',
}

const FEATURES = [
  { icon: Camera, title: 'AI Photo Catalog', desc: 'Snap product photos and get auto-tagged catalog entries with category, colour and fabric.' },
  { icon: Share2, title: 'WhatsApp Collections', desc: 'Select products, generate a link, and share with customers on WhatsApp in one tap.' },
  { icon: Search, title: 'AI-Powered Search', desc: 'Find any product with natural language — "pink cotton suit under ₹2000".' },
]

export default function DownloadPage() {
  return (
    <>
      <Navbar />
      <PageHero
        tag="Android early access"
        title="The Kanchuki retailer app."
        lead="Shoot a dress, AI writes the catalog, share on WhatsApp. Built for the phone you already use, and built to work even where the network is weak."
      />

      <Section>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Honest state: the Android build exists (EAS-distributed, not yet
              a public direct-install link) — Play Store/iOS aren't live.
              No fake QR/download button and no simulated "join the waitlist"
              email capture (docs/content honesty gate). */}
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-8 sm:p-10">
            <Smartphone size={28} strokeWidth={1.5} className="mx-auto mb-4 text-ink-600" />
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-charcoal mb-2">Get the Android app</h2>
            <p className="text-sm sm:text-base text-sand-500 leading-relaxed mb-6">The Android app is in early access. Message us and we&apos;ll get you set up — a direct install link, or help onboarding your first products. Play Store and iOS listings are coming soon.</p>
            <a href="/contact" className="inline-flex items-center justify-center bg-ink-600 text-white font-semibold px-8 py-3.5 rounded-full hover:bg-ink-700 transition active:scale-[0.97]">Request Android access</a>
          </div>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <div className="text-center mb-12">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-charcoal">What&apos;s inside</h2>
            </div>
          </AnimatedSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 border border-sand-200">
                <div className="w-10 h-10 bg-ink-50 rounded-xl flex items-center justify-center mb-4">
                  <f.icon size={20} strokeWidth={1.5} className="text-ink-600" />
                </div>
                <h3 className="font-semibold text-charcoal mb-1">{f.title}</h3>
                <p className="text-sm text-sand-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <FinalCta
        title="Start with 10 dresses and 14 free days."
        lead="Photograph, save, share — tonight."
        primaryLabel="Start Free Trial"
        primaryHref="/pricing"
        secondaryLabel="See how it works"
        secondaryHref="/how-it-works"
      />
      <Footer />
    </>
  )
}
