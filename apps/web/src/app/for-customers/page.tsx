import type { Metadata } from 'next'
import Link from 'next/link'
import { Grid3x3, Eye, Heart, MessageCircle, ShoppingCart, ShieldCheck, MapPin } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, ColorCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { ACCENT_TEXT, ACCENT_SUBTLE } from '@/components/site/accents'

export const metadata: Metadata = {
  title: 'For Customers — Browse & Enquire at Real Clothing Stores | Kanchuki',
  description:
    'Shop real clothing stores on your phone — browse catalogs, favourite pieces, and message the shop directly on WhatsApp. No app needed.',
}

const CAN_DO = [
  { icon: Grid3x3, title: 'Browse by category', desc: 'Kurtis, suits, sarees, lehengas — or scroll the whole collection.', accent: 'cobalt' as const },
  { icon: Eye, title: 'Look at every angle', desc: 'Each product shows its photos, colour, fabric and sizes.', accent: 'volt' as const },
  { icon: Heart, title: 'Save what you like', desc: 'Tap the heart to favourite pieces and come back to them.', accent: 'iris' as const },
  { icon: MessageCircle, title: 'Ask the shop directly', desc: 'Every product has an Enquire button — message the owner about price, size, or availability.', accent: 'terracotta' as const },
  { icon: ShoppingCart, title: 'Buy when checkout is on', desc: 'Some stores let you add to cart and pay online. If not, just enquire — the owner replies.', accent: 'moss' as const },
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
            {CAN_DO.map((f) => (
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
            <SectionHeader tag="Real shops" title="Every store is a real shop" />
          </AnimatedSection>
          <div className="space-y-4 text-carbon/70 text-sm sm:text-base leading-relaxed">
            <p>The shops on Kanchuki are physical clothing stores — the same ones you&apos;d walk into. Each store page shows the shop name, city and owner, so you&apos;re dealing with a real person, not a faceless website.</p>
            <p><strong className="text-carbon">WhatsApp is the counter.</strong> When you enquire, the shop replies the way you&apos;d talk to them in person — same phone, same owner.</p>
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
                <span className={`shrink-0 w-8 h-8 rounded-full text-sm font-semibold flex items-center justify-center ${i % 2 === 0 ? 'bg-cobalt-600 text-white' : 'bg-volt text-carbon'}`}>{i + 1}</span>
                <span className="text-carbon/70 text-sm sm:text-base leading-relaxed pt-1">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-2 gap-8">
          <div>
            <ShieldCheck size={24} strokeWidth={1.5} className="text-cobalt-600 mb-3" />
            <h3 className="font-display text-lg font-semibold text-carbon mb-2">Is my information safe?</h3>
            <p className="text-sm text-carbon/60 leading-relaxed">You don&apos;t need an account to browse. When you enquire, the shop sees only what you choose to share. Kanchuki follows India&apos;s data norms — no random ads, no selling your number.</p>
          </div>
          <div>
            <MapPin size={24} strokeWidth={1.5} className="text-terracotta mb-3" />
            <h3 className="font-display text-lg font-semibold text-carbon mb-2">Looking for a particular store?</h3>
            <p className="text-sm text-carbon/60 leading-relaxed">Browse the <Link href="/stores" className="font-semibold text-cobalt-600 hover:text-cobalt-700 underline decoration-cobalt-200 underline-offset-2 transition-colors">store directory</Link> to find shops by city — or ask your favourite shop to join Kanchuki. It&apos;s free for 14 days, and new stores join every week.</p>
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
