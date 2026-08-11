import type { Metadata } from 'next'
import { Grid3x3, Eye, Heart, MessageCircle, ShoppingCart, ShieldCheck, MapPin } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, SelvedgeCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'

export const metadata: Metadata = {
  title: 'For Customers — Browse & Enquire at Real Clothing Stores | Kanchuki',
  description:
    'Shop real clothing stores on your phone — browse catalogs, favourite pieces, and message the shop directly on WhatsApp. No app needed.',
}

const CAN_DO = [
  { icon: Grid3x3, title: 'Browse by category', desc: 'Kurtis, suits, sarees, lehengas — or scroll the whole collection.' },
  { icon: Eye, title: 'Look at every angle', desc: 'Each product shows its photos, colour, fabric and sizes.' },
  { icon: Heart, title: 'Save what you like', desc: 'Tap the heart to favourite pieces and come back to them.' },
  { icon: MessageCircle, title: 'Ask the shop directly', desc: 'Every product has an Enquire button — message the owner about price, size, or availability.' },
  { icon: ShoppingCart, title: 'Buy when checkout is on', desc: 'Some stores let you add to cart and pay online. If not, just enquire — the owner replies.' },
]

const STEPS = [
  'Open the link the shop sent you — it works on any phone, no app needed.',
  'Tap a category or scroll to see everything.',
  'Tap a product to see its photos, colours, fabric and sizes.',
  'Favourite what you like, then tap Enquire to ask about it.',
  'Checkout, if the store has it enabled — add to cart, pay by UPI/card/netbanking.',
]

export default function ForCustomersPage() {
  return (
    <>
      <Navbar />
      <PageHero
        tag="For Customers"
        title="Shop real clothing stores from your phone."
        lead="When a shop shares a Kanchuki link with you, you're looking at their real catalog — the same dresses, suits and sarees they have in the shop, photographed and ready to browse. No app to install, no account to make. Just look, like, and ask."
      />

      <Section id="what-you-can-do">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="On any store's catalog" title="What you can do" />
          </AnimatedSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {CAN_DO.map((f, i) => (
              <SelvedgeCard key={f.title} accent={(['ink', 'rust', 'turmeric'] as const)[i % 3]} className="p-6 sm:p-7">
                <f.icon size={24} strokeWidth={1.5} className="mb-4 text-ink-600" />
                <h3 className="text-base font-semibold text-charcoal mb-2">{f.title}</h3>
                <p className="text-sm text-sand-500 leading-relaxed">{f.desc}</p>
              </SelvedgeCard>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Real shops" title="Every store is a real shop" />
          </AnimatedSection>
          <div className="space-y-4 text-sand-600 text-sm sm:text-base leading-relaxed">
            <p>The shops on Kanchuki are physical clothing stores — the same ones you&apos;d walk into. Each store page shows the shop name, city and owner, so you&apos;re dealing with a real person, not a faceless website.</p>
            <p><strong className="text-charcoal">WhatsApp is the counter.</strong> When you enquire, the shop replies the way you&apos;d talk to them in person — same phone, same owner.</p>
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="How to browse" title="How to browse like a pro" />
          </AnimatedSection>
          <ol className="space-y-4">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-full bg-ink-50 border border-ink-100 text-ink-700 text-sm font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="text-sand-600 text-sm sm:text-base leading-relaxed pt-1">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-2 gap-8">
          <div>
            <ShieldCheck size={24} strokeWidth={1.5} className="text-ink-600 mb-3" />
            <h3 className="text-lg font-semibold text-charcoal mb-2">Is my information safe?</h3>
            <p className="text-sm text-sand-500 leading-relaxed">You don&apos;t need an account to browse. When you enquire, the shop sees only what you choose to share. Kanchuki follows India&apos;s data norms — no random ads, no selling your number.</p>
          </div>
          <div>
            <MapPin size={24} strokeWidth={1.5} className="text-rust-600 mb-3" />
            <h3 className="text-lg font-semibold text-charcoal mb-2">Looking for a particular store?</h3>
            <p className="text-sm text-sand-500 leading-relaxed">Ask your favourite shop to join Kanchuki — it&apos;s free for 14 days. New stores join every week.</p>
          </div>
        </div>
      </Section>

      <FinalCta
        title="Ask your favourite shop to join Kanchuki."
        lead="It's free for 14 days — and their catalog could be one link away."
        primaryLabel="Start Free Trial"
        secondaryLabel="See how it works"
        secondaryHref="/how-it-works"
      />
      <Footer />
    </>
  )
}
