import type { Metadata } from 'next'
import { Navbar, Footer, Section, SectionHeader, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { FaqAccordion } from './FaqAccordion'

export const metadata: Metadata = {
  title: 'FAQ — Kanchuki for Indian Clothing Stores',
  description:
    'Answers for shop owners — how AI tagging works, WhatsApp selling, pricing, offline mode, and data safety. 14-day free trial, no credit card.',
}

const GROUPS: { tag: string; items: { q: string; a: string }[] }[] = [
  {
    tag: 'Getting started',
    items: [
      { q: 'Do I need a website?', a: 'No. That\'s the point. Your catalog lives on a link you share on WhatsApp, and your shop gets its own page on Kanchuki. No domain, no hosting, no website builder.' },
      { q: 'Do my customers need an app?', a: 'No. The link opens in their phone\'s browser — usually right inside WhatsApp. They can browse, favourite, and enquire without installing anything.' },
      { q: 'How long until my shop is online?', a: 'Most shops are online the same evening. Photograph your best pieces, add prices, save, share the link.' },
      { q: 'Can I try it before paying?', a: 'Yes — 14 days free, no credit card. After that, plans start at ₹999/month.' },
    ],
  },
  {
    tag: 'Catalog & photos',
    items: [
      { q: 'How does AI tagging work?', a: 'You photograph a dress. AI looks at the photo and adds the category, subtype, colour, fabric, and occasion, plus a short description and an auto SKU. You can edit anything it writes — your edits always win.' },
      { q: 'What if I have 3,000 SKUs from a supplier?', a: 'Use bulk onboarding: import the supplier PDF/catalog, or photograph your racks shelf-by-shelf. AI detects each item. No typing.' },
      { q: 'My photos aren\'t professional. Is that okay?', a: 'Yes. AI cleans them — removes the background, picks a contrasting backdrop, fills hollow necklines. Clean catalog photos without a photographer.' },
      { q: 'Can I mark things SOLD or reserved?', a: 'Yes, with one tap — or scan the rack tag (works even offline).' },
    ],
  },
  {
    tag: 'Sharing & selling',
    items: [
      { q: 'How do customers buy?', a: 'They browse, favourite, and tap Enquire — then message you directly on WhatsApp. Stores that connect checkout let customers pay online too (UPI, cards, netbanking).' },
      { q: 'What is a collection link?', a: 'You pick products, tap share, and Kanchuki makes a WhatsApp link for that set — a festival collection, new arrivals, a sale. Send it to one customer or a whole group.' },
      { q: 'Do I get my own store page?', a: 'Yes — every shop gets a free store page at its own link (e.g. kanchuki.app/store/your-shop) plus a QR code you can print for the counter.' },
    ],
  },
  {
    tag: 'Money & billing',
    items: [
      { q: 'How much does it cost?', a: 'Starter ₹999/mo, Growth ₹2,499/mo, Pro ₹4,999/mo. Annual billing saves 20%. Prices in INR with GST invoices.' },
      { q: 'How do I pay?', a: 'UPI (GPay, PhonePe, PayTM), cards, or netbanking. No forex, no hidden charges.' },
      { q: 'What if I hit a product limit?', a: 'Buy a small add-on pack for that month, or upgrade the plan. Nothing gets deleted.' },
    ],
  },
  {
    tag: 'Phones & offline',
    items: [
      { q: 'Will it work on my old phone?', a: 'Yes. The app and customer pages are built for budget Android phones and slow connections.' },
      { q: 'What happens when the internet drops?', a: 'The app keeps working — you can browse and update your catalog. Changes sync when you\'re back online.' },
    ],
  },
  {
    tag: 'Data & trust',
    items: [
      { q: 'Who owns the customer data?', a: 'Your shop does. Customer photos and details belong to you; deletion is supported. Kanchuki follows India\'s data norms.' },
      { q: 'Can my staff use it too?', a: 'Yes — on the Pro plan, add staff with their own logins. Team members can help without touching your account.' },
      { q: 'Is the app on the Play Store?', a: 'Android APK is available now via direct install. Play Store and iOS listings are coming soon.' },
    ],
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GROUPS.flatMap((g) => g.items).map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function FaqPage() {
  return (
    <>
      {/* JSON-LD from a static, locally-authored FAQ array — `<` escaped so the
          payload can never prematurely close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Navbar />
      <PageHero
        tag="FAQ"
        title="Questions shop owners ask us."
        lead="If your question isn't here, message us — we answer during business hours (10 AM–7 PM IST)."
      />

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
          {GROUPS.map((group) => (
            <div key={group.tag}>
              <AnimatedSection>
                <SectionHeader title={group.tag} align="left" />
              </AnimatedSection>
              <FaqAccordion items={group.items} />
            </div>
          ))}
        </div>
      </Section>

      <FinalCta
        title="Still stuck?"
        lead="Message us — we reply in business hours (10 AM–7 PM IST) — or start your free trial."
        primaryLabel="Contact us"
        primaryHref="/contact"
        secondaryLabel="Start Free Trial"
        secondaryHref="/pricing"
      />
      <Footer />
    </>
  )
}
