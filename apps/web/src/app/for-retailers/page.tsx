import type { Metadata } from 'next'
import { Camera, Wand2, MessageCircle, Store, Heart, Package, ScanLine, WifiOff, Users } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, ColorCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { ACCENT_TEXT, ACCENT_SUBTLE } from '@/components/site/accents'
import { PLAN_LIMITS } from '@kanchuki/shared'
import { getPlanPricing, rupees } from '@/lib/plan-pricing'

const perMonth = (p: { monthly: number } | undefined) => (p ? ` ${rupees(p.monthly)}/mo` : '')
const count = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-IN') : 'unlimited')

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
  { icon: Heart, title: 'Know your customers', desc: 'Save each customer’s colour, style, budget and occasions. Search your own racks in plain language: "pink cotton suit under ₹2000".', accent: 'mint' as const },
  { icon: Package, title: 'Bulk onboarding', desc: 'Got 500–3,000 SKUs from a supplier? Import the supplier PDF/catalog, or shoot your racks shelf-by-shelf and let AI detect each item. A catalog-upload visit service is also available.', accent: 'cobalt' as const },
  { icon: ScanLine, title: 'Scan-to-sell', desc: 'Print the SKU + QR tag for each design. When a piece sells, scan the tag — it’s marked SOLD, even if your internet is down. Syncs when you’re back online.', accent: 'fern' as const },
  { icon: WifiOff, title: 'Offline-first', desc: 'Built for shops where the network is patchy. Browse your catalog, change a product’s status — it queues up and syncs when the connection returns.', accent: 'sandal' as const },
  { icon: Users, title: 'Team, staff and control', desc: 'Add staff with their own logins — a helper can scan-to-sell or add products without touching your account. You own your data; deletion is supported.', accent: 'iris' as const },
]

const COMING_SOON = [
  { feature: 'Hindi UI', status: 'Year 1' },
  { feature: 'Play Store / iOS app listings', status: 'Coming soon — Android APK available now' },
]

// §5B.1 — affiliate referral capture (docs/tasks/pending/post-referral-cleanup-and-launch.md §5B).
// The shareable link T3 already mints (buildReferralLink) points HERE with
// ?ref=<CODE> — reused rather than a new /r/<CODE> route, so there is one
// referral-link shape, not two. Cosmetic shape check only (display gating,
// not a security boundary): T4's server-side write is the real validator, and
// a garbage ?ref= must render the page exactly as if it were absent.
const REF_CODE_PATTERN = /^KAN-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

export default async function ForRetailersPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const price = await getPlanPricing()
  const rawRef = (await searchParams).ref?.trim().toUpperCase()
  const refCode = rawRef && REF_CODE_PATTERN.test(rawRef) ? rawRef : null
  return (
    <>
      <Navbar />
      <PageHero
        tag="For Retailers"
        title="Run your clothing shop online — from your phone, no website needed."
        lead="You take a photo of a dress. Kanchuki writes the catalog entry, cleans the photo, and gives you a link to share on WhatsApp. Your customers browse it like a real store — and message you when they want something. Here's everything the app does for your shop."
      />

      {refCode && (
        <Section className="bg-white">
          <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-volt/40 bg-volt/10 p-6 sm:p-7 text-center">
              <p className="text-sm text-carbon/70">
                You were referred by a Kanchuki partner. Enter this code when you set up your shop
                in the app to activate it:
              </p>
              <p className="mt-3 font-display text-2xl font-semibold tracking-wide text-carbon">
                {refCode}
              </p>
              {/* ponytail: mobile onboarding does not read this param yet — the manual
                  code field it already has (T4) works today; auto-prefilling from this
                  deep link is apps/mobile work gated on an EAS build (board §5B.2). */}
              <a
                href={`kanchuki://onboarding?ref=${encodeURIComponent(refCode)}`}
                className="mt-5 inline-flex items-center justify-center bg-volt text-carbon font-semibold px-6 py-3 rounded-full hover:bg-volt-600 transition active:scale-[0.97]"
              >
                Open in Kanchuki app
              </a>
              <p className="text-xs text-carbon/40 mt-3">
                Opening this link needs the Kanchuki app already installed.
              </p>
            </div>
          </div>
        </Section>
      )}

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
            <li><strong className="text-carbon">Starter{perMonth(price?.STARTER)}</strong> — one shop, {count(PLAN_LIMITS.STARTER.max_products)} products, unlimited customers, AI tagging included.</li>
            <li><strong className="text-carbon">Growth{perMonth(price?.GROWTH)}</strong> — {count(PLAN_LIMITS.GROWTH.max_products)} products, unlimited customers, unlimited links.</li>
            <li><strong className="text-carbon">Pro{perMonth(price?.PRO)}</strong> — {count(PLAN_LIMITS.PRO.max_products)} products, WhatsApp automation, multi-staff, campaign system.</li>
          </ul>
          <p className="mt-6 text-sm text-carbon/50">14-day free trial, no credit card. UPI, cards, netbanking. GST invoices. Full details on <a href="/pricing" className="text-cobalt-600 font-medium hover:underline">the pricing page</a>.</p>
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
