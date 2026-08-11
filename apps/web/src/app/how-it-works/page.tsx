import type { Metadata } from 'next'
import { Camera, Share2, BarChart3, Package, ListChecks, Send, TrendingUp, Smartphone } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, SelvedgeCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'

export const metadata: Metadata = {
  title: 'How It Works — From Photo to WhatsApp Catalog in 3 Steps | Kanchuki',
  description:
    'Photograph a dress, AI writes the catalog, share on WhatsApp. See how Kanchuki works — 3 steps, no website, 14-day free trial.',
}

const STEPS = [
  { step: '01', icon: Camera, title: 'Snap & Tag', desc: 'Open the app, photograph a dress. AI adds the details in the background — category, subtype, colour, fabric, occasion, a short description and an auto SKU. You set the price and save. About 10 seconds per product once you\'re used to it.' },
  { step: '02', icon: Send, title: 'Select & Share', desc: 'Pick the pieces you want to show — a new arrival, a festival collection, a few sale items. Tap share. Kanchuki builds a WhatsApp link for that collection and sends it to a customer, a family group, or your whole list.' },
  { step: '03', icon: BarChart3, title: 'Sell More', desc: 'Customers browse, heart what they like, and tap Enquire. You get the enquiry in the app and reply — like a WhatsApp chat, but organised. Stores with checkout enabled can take payment online too.' },
]

const WALKTHROUGH = [
  { icon: Package, title: '1. Add products', desc: 'One photo → AI-tagged product, or bulk: shoot racks shelf-by-shelf or import a supplier PDF for 500–3,000 SKUs. Every product gets sizes (S–XXXL), a category, colour, fabric, and a rack/shelf location.' },
  { icon: ListChecks, title: '2. Manage your catalog', desc: 'See everything in one list — search by name, colour, or price range. Edit anything AI wrote; your edits always win. Mark pieces SOLD or reserved with one tap, or scan the rack tag (works offline).' },
  { icon: Share2, title: '3. Share with customers', desc: 'WhatsApp collections — one link per occasion or collection. Store QR — print it, stick it on the counter, customers scan and browse. Every shop also gets its own store page at a personal link.' },
  { icon: TrendingUp, title: '4. Grow with customer insights', desc: 'Favourites and enquiries tell you what people actually want. Fashion DNA notes each customer\'s colour, style, budget and occasions — so your next WhatsApp to them shows the right things.' },
]

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <PageHero
        tag="How It Works"
        title="Online tonight. Here's exactly how."
        lead="From a photo of a dress to a catalog your customers can browse — in three steps. Most shops are online the same evening they start."
      />

      <Section id="steps">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="The 3 steps" title="Three steps. No tech skills needed." />
          </AnimatedSection>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-12 relative">
            <div className="hidden sm:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-ink-200" />
            {STEPS.map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 overflow-hidden bg-white rounded-xl border border-ink-200 flex items-center justify-center">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-ink-600" />
                  <item.icon size={26} strokeWidth={1.5} className="text-ink-600" />
                </div>
                <div className="font-display text-xs font-semibold text-rust-600 mb-2 tracking-widest">STEP {item.step}</div>
                <h3 className="text-lg font-semibold text-charcoal mb-3">{item.title}</h3>
                <p className="text-sm text-sand-500 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="The full walkthrough" title="How the app works" subtitle="Four things you'll do in the app, in order." />
          </AnimatedSection>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
            {WALKTHROUGH.map((w, i) => (
              <SelvedgeCard key={w.title} accent={(['ink', 'rust', 'turmeric', 'ink'] as const)[i]} className="p-6 sm:p-7">
                <w.icon size={24} strokeWidth={1.5} className="mb-4 text-ink-600" />
                <h3 className="text-base font-semibold text-charcoal mb-2">{w.title}</h3>
                <p className="text-sm text-sand-500 leading-relaxed">{w.desc}</p>
              </SelvedgeCard>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="AI in the background" title="What happens after you save?" />
          </AnimatedSection>
          <div className="text-sand-600 text-sm sm:text-base leading-relaxed space-y-3">
            <p>You never wait on a loading screen. After you save, the app quietly:</p>
            <ol className="list-decimal list-inside space-y-2 pl-2">
              <li>Tags the product (name, category, colour, fabric, occasion, description, SKU).</li>
              <li>Cleans the photo — removes the background, sets an auto-contrast backdrop.</li>
              <li>Makes the catalog live.</li>
            </ol>
            <p>If you need to correct anything, edit it — AI never overwrites your changes.</p>
          </div>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Smartphone size={28} strokeWidth={1.5} className="mx-auto mb-4 text-ink-600" />
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-charcoal mb-4">Works on the phone your shop already has</h2>
          <p className="text-sand-500 leading-relaxed max-w-2xl mx-auto">Built for budget Android phones and patchy networks. Offline mode lets you browse and update your catalog, syncing when the connection returns. Customer pages are light and fast — they open quickly even on old phones and slow connections.</p>
        </div>
      </Section>

      <FinalCta
        title="Start your 14-day free trial."
        lead="Photograph one dress tonight. See your catalog tomorrow morning."
        secondaryLabel="Download the Android app"
        secondaryHref="/download"
      />
      <Footer />
    </>
  )
}
