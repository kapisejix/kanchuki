import type { Metadata } from 'next'
import { PLAN_PRICING, ADDON_PRICING } from '@kanchuki/shared'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Plan = 'STARTER' | 'GROWTH' | 'PRO'

async function getPlanPricing(): Promise<Record<Plan, { monthly: number }>> {
  try {
    const res = await fetch(`${API_URL}/v1/public/pricing`, { next: { revalidate: 60 } })
    if (!res.ok) return PLAN_PRICING
    const json = await res.json()
    const rows: { plan: Plan; monthly: number }[] = json.data ?? []
    if (rows.length === 0) return PLAN_PRICING
    return Object.fromEntries(rows.map((r) => [r.plan, { monthly: r.monthly }])) as Record<
      Plan,
      { monthly: number }
    >
  } catch {
    return PLAN_PRICING
  }
}
import { Navbar, Footer, Section, SectionHeader, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { PricingTable } from './PricingTable'

export const metadata: Metadata = {
  title: 'Pricing — ₹999/mo for Indian Clothing Stores | Kanchuki',
  description:
    'Kanchuki plans from ₹999/month — AI photo catalog, WhatsApp collections, store page. 14-day free trial, no credit card. UPI, GST invoices, INR only.',
}

const ROWS: { label: string; values: [string, string, string] }[] = [
  { label: 'Products', values: ['500', '2,000', 'Unlimited'] },
  { label: 'Customers', values: ['Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'Collection links', values: ['50/month', 'Unlimited', 'Unlimited'] },
  { label: 'AI photo tagging', values: ['✅', '✅', '✅'] },
  { label: 'AI photo cleanup & backgrounds', values: ['✅', '✅', '✅'] },
  { label: 'Store page + QR code', values: ['✅', '✅', '✅'] },
  { label: 'Offline mode', values: ['✅', '✅', '✅'] },
  { label: 'AI search ("pink suit under ₹2000")', values: ['✅', '✅', '✅'] },
  { label: 'Fashion DNA (customer preferences)', values: ['✅', '✅', '✅'] },
  { label: 'Try-ons', values: ['—', '100/month', '500/month'] },
  { label: 'WhatsApp automation', values: ['—', '—', '✅'] },
  { label: 'Multi-staff logins', values: ['—', '—', '✅'] },
  { label: 'Bulk onboarding (PDF / racks)', values: ['—', '✅', '✅'] },
]

const OLD_WAY = [
  { label: 'Catalog photos', old: 'Photographer + editor, ₹2,000–5,000 per shoot', kanchuki: 'Included (AI cleanup)' },
  { label: 'Writing product descriptions', old: 'Hours of typing or a hired assistant', kanchuki: 'Included (AI writes them)' },
  { label: 'A website', old: '₹10,000–50,000 + maintenance', kanchuki: 'Included (your store page + WhatsApp links)' },
  { label: 'Monthly cost', old: 'Easily ₹2,000+ with no results yet', kanchuki: 'From ₹999, results the same week' },
]

const FAQ = [
  { q: 'Is there really no credit card for the trial?', a: 'Correct. Start free, and only pay when you\'re sure it works for your shop.' },
  { q: 'Can I switch plans later?', a: 'Yes — upgrade or downgrade anytime.' },
  { q: 'What happens when I hit a product limit?', a: 'You can buy an add-on pack for that month, or upgrade the plan. Nothing gets deleted.' },
  { q: 'Is GST added on top?', a: 'Prices include GST invoicing — you get proper invoices for every payment.' },

]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default async function PricingPage() {
  const pricing = await getPlanPricing()
  const addons = ADDON_PRICING as Record<string, { label: string; price_paise: number }[]>
  const addonLines = Object.values(addons).flat()

  return (
    <>
      {/* JSON-LD from a static, locally-authored FAQ array (no user/DB input) — the
          standard Next.js pattern for structured data. `<` is escaped so the
          payload can never prematurely close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Navbar />
      <PageHero
        tag="Pricing"
        title="Simple pricing for a clothing shop."
        lead="Three plans, one app, no surprises. Every plan starts with a 14-day free trial — no credit card. Prices in INR, GST invoices included, pay by UPI, card, or netbanking."
      />

      <Section id="plans">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Choose your plan" title="Every plan starts free for 14 days" />
          </AnimatedSection>
          <PricingTable pricing={pricing} rows={ROWS} />
          <p className="text-center text-sm text-carbon/40 mt-8">14-day free trial · no credit card · UPI (GPay/PhonePe/PayTM), cards, netbanking · INR only · GST invoices.</p>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Add-ons" title="Only if you need more" subtitle="For shops on a plan who hit a limit in a busy month — buy more without changing plans." />
          </AnimatedSection>
          <div className="overflow-x-auto rounded-2xl border border-carbon/10 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {addonLines.map((a, i) => (
                  <tr key={a.label} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/70'}>
                    <td className="px-5 py-3.5 text-carbon/70">{a.label}</td>
                    <td className="px-5 py-3.5 text-carbon font-semibold text-right">₹{(a.price_paise / 100).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Compare" title="What you'd pay the old way" />
          </AnimatedSection>
          <div className="overflow-x-auto rounded-2xl border border-carbon/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-carbon/10 bg-cream">
                  <th className="text-left px-5 py-4 text-carbon/50 font-medium text-xs uppercase tracking-wider"> </th>
                  <th className="text-left px-5 py-4 text-carbon/50 font-medium text-xs uppercase tracking-wider">Old way</th>
                  <th className="text-left px-5 py-4 text-carbon/50 font-medium text-xs uppercase tracking-wider">Kanchuki</th>
                </tr>
              </thead>
              <tbody>
                {OLD_WAY.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-cream/60'}>
                    <td className="px-5 py-4 text-carbon font-medium">{row.label}</td>
                    <td className="px-5 py-4 text-carbon/60">{row.old}</td>
                    <td className="px-5 py-4 text-cobalt-600 font-medium">{row.kanchuki}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="FAQ" title="Pricing questions" />
          </AnimatedSection>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <div key={f.q} className="bg-white rounded-2xl border border-carbon/10 p-6 transition-colors hover:border-carbon/25">
                <h3 className="text-sm font-semibold text-carbon mb-2">{f.q}</h3>
                <p className="text-sm text-carbon/60 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <FinalCta
        title="Photograph your best 10 dresses on the free trial."
        lead="See the catalog tonight. Start with the shop in front of you."
        secondaryLabel="Talk to us"
        secondaryHref="/contact"
      />
      <Footer />
    </>
  )
}
