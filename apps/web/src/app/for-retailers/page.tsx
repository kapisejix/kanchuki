import type { Metadata } from 'next'
import { Camera, Wand2, MessageCircle, Store, Heart, Package, ScanLine, WifiOff, Users } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, ColorCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { ACCENT_TEXT, ACCENT_SUBTLE } from '@/components/site/accents'

export const metadata: Metadata = {
  title: 'For Retailers — AI Catalog & WhatsApp Selling for Clothing Stores | Kanchuki',
  description:
    'Photograph your dresses, AI writes the catalog, share on WhatsApp. No website needed. Built for Indian clothing stores — 14-day free trial.',
}

const FEATURES = [
  { icon: Camera, title: 'The catalog that writes itself', desc: 'Photograph a dress. AI adds category, subtype, colour, fabric and occasion, writes a short description, suggests a name, and generates an auto SKU. Edit anything it gets wrong — your picks always win.', accent: 'cobalt' as const },
  { icon: Wand2, title: 'AI works in the background', desc: 'Click photos, set a price, tap save. While you go back to the shop floor, AI tags the product, cleans up the photo, and sets a good background. No loading screen to wait on.', accent: 'volt' as const },
  { icon: Wand2, title: 'Photos that look like a big brand’s', desc: 'Background removal, auto-contrast backdrops (dark clothes get a light background and vice versa), ghost-mannequin fill for hollow necklines, rotate and retouch — no photographer needed.', accent: 'terracotta' as const },
  { icon: MessageCircle, title: 'Sell on WhatsApp', desc: 'Select the pieces you want to show, get a collection link, share it on WhatsApp. Customers browse, favourite and tap Enquire to message you directly. No app for them, no website for you.', accent: 'iris' as const },
  { icon: Store, title: 'Your own store page', desc: 'Every shop gets a free storefront at its own link (e.g. kanchuki.app/store/your-shop) with your shop name, logo and categories, plus a store QR code you can print for the counter.', accent: 'moss' as const },
  { icon: Heart, title: 'Fashion DNA — know your customers', desc: 'Save each customer’s colour, style, budget and occasions. Search your own racks in plain language: "pink cotton suit under ₹2000".', accent: 'mint' as const },
  { icon: Package, title: 'Bulk onboarding', desc: 'Got 500–3,000 SKUs from a supplier? Import the supplier PDF/catalog, or shoot your racks shelf-by-shelf and let AI detect each item. A catalog-upload visit service is also available.', accent: 'cobalt' as const },
  { icon: ScanLine, title: 'Scan-to-sell', desc: 'Print the SKU + QR tag for each design. When a piece sells, scan the tag — it’s marked SOLD, even if your internet is down. Syncs when you’re back online.', accent: 'fern' as const },
  { icon: WifiOff, title: 'Offline-first', desc: 'Built for shops where the network is patchy. Browse your catalog, change a product’s status — it queues up and syncs when the connection returns.', accent: 'sandal' as const },
  { icon: Users, title: 'Team, staff and control', desc: 'Add staff with their own logins — a helper can scan-to-sell or add products without touching your account. You own your data; deletion is supported.', accent: 'iris' as const },
]

const COMING_SOON = [
  { feature: 'Virtual Try-On (customer tries outfits on their own photo)', status: 'Engine live, customer rollout coming soon' },
  { feature: 'AI Fashion DNA matching across customers', status: 'Phase 1' },
  { feature: 'Hindi UI', status: 'Year 1' },
  { feature: 'Play Store / iOS app listings', status: 'Coming soon — Android APK available now' },
]

export default function ForRetailersPage() {
  return (
    <>
      <Navbar />
      <PageHero
        tag="For Retailers"
        title="Run your clothing shop online — from your phone, no website needed."
        lead="You take a photo of a dress. Kanchuki writes the catalog entry, cleans the photo, and gives you a link to share on WhatsApp. Your customers browse it like a real store — and message you when they want something. Here's everything the app does for your shop."
      />

      <Section id="features">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="What the app does" title="Everything your shop needs, on one phone" />
          </AnimatedSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {FEATURES.map((f) => (
              <ColorCard key={f.title} accent={f.accent} className="p-6 sm:p-7">
                <f.icon size={24} strokeWidth={1.5} className={`mb-4 ${ACCENT_TEXT[f.accent]}`} />
                <h3 className={`font-display text-base font-semibold mb-2 ${ACCENT_TEXT[f.accent]}`}>{f.title}</h3>
                <p className={`text-sm leading-relaxed ${ACCENT_SUBTLE[f.accent]}`}>{f.desc}</p>
              </ColorCard>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Pricing" title="Pricing that fits a small shop" />
          </AnimatedSection>
          <ul className="space-y-3 text-carbon/70 text-sm sm:text-base leading-relaxed">
            <li><strong className="text-carbon">Starter ₹999/mo</strong> — one shop, 500 products, unlimited customers, AI tagging included.</li>
            <li><strong className="text-carbon">Growth ₹2,499/mo</strong> — 2,000 products, unlimited customers, unlimited links, try-on credits.</li>
            <li><strong className="text-carbon">Pro ₹4,999/mo</strong> — unlimited products, WhatsApp automation, multi-staff, more try-ons.</li>
          </ul>
          <p className="mt-6 text-sm text-carbon/50">14-day free trial, no credit card. UPI, cards, netbanking. GST invoices. Annual plans save 20%. Full details on <a href="/pricing" className="text-cobalt-600 font-medium hover:underline">the pricing page</a>.</p>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Honest roadmap" title="What's coming" />
          </AnimatedSection>
          <div className="overflow-x-auto rounded-2xl border border-carbon/10">
            <table className="w-full text-sm">
              <tbody>
                {COMING_SOON.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-cream'}>
                    <td className="px-5 py-4 text-carbon/70">{row.feature}</td>
                    <td className="px-5 py-4 text-cobalt-600 font-medium whitespace-nowrap">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <FinalCta
        title="Photograph one dress tonight. See your catalog tomorrow morning."
        lead="That's the whole pitch. Start your 14-day free trial — no card needed."
        secondaryLabel="See how it works"
        secondaryHref="/how-it-works"
      />
      <Footer />
    </>
  )
}
