import type { Metadata } from 'next'
import { Navbar, Footer, Section, SectionHeader, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'

export const metadata: Metadata = {
  title: 'About — Why We Built Kanchuki | Kanchuki',
  description:
    'Kanchuki gives India\'s clothing shops a photo-to-WhatsApp catalog, powered by AI — no website needed. The story, the name, and what we believe.',
}

const BELIEFS = [
  { title: 'The catalogue is the shop.', desc: 'Stock on a rack is invisible at 9 PM. A photo, tagged and shareable, is a shop that never closes.' },
  { title: 'AI should remove typing, not judgement.', desc: 'The shopkeeper knows fabric and fit. We give them back the hours they used to spend writing "Teal embroidered kurta set with silver gota work".' },
  { title: 'WhatsApp is the Indian storefront.', desc: 'Your customers are already there. Meet them where they are.' },
  { title: 'A small shop deserves big-brand photos.', desc: 'Clean backgrounds, consistent lighting, ghost-mannequin fills — without a photo shoot.' },
  { title: 'Trust is earned with honesty.', desc: 'Real numbers, real stores, real pricing — and we tell you plainly what\'s coming soon instead of pretending.' },
]

const BUILT = [
  'A photo-to-catalog AI that tags category, colour, fabric, occasion, description and SKU from a single photo.',
  'WhatsApp collection links and store pages that need no website.',
  'Photo cleanup — background removal, auto-contrast backdrops, ghost-mannequin fill.',
  'Offline-first mobile app built for budget Android phones and patchy networks.',
  'Admin control center — the platform protects store data, supports deletion, and follows India\'s data norms.',
]

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <PageHero
        title="Why we built Kanchuki."
        lead="India has more than a million clothing shops — most of them offline, most of them run by one or two people with an eye for cloth and a stack of bills. Kanchuki exists to give those shops the same reach a big brand has, without a website, without a team, without a photographer."
      />

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="The name" title="Kanchuki" align="left" />
          </AnimatedSection>
          <div className="text-sand-600 text-sm sm:text-base leading-relaxed space-y-3">
            <p><strong className="text-charcoal">Kanchuki</strong> (कांचुकी / kanchuki) is the tailored bodice worn under a saree or ghagra — the quiet piece that makes everything else fit properly.</p>
            <p>It&apos;s the right name for what we build: technology that fits the garment trade. Not a platform you have to change your shop for — a tool that fits under what you already wear, already do, already sell.</p>
          </div>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="What we believe" title="Five things we won't compromise on" />
          </AnimatedSection>
          <div className="space-y-6">
            {BELIEFS.map((b) => (
              <div key={b.title} className="border-l-2 border-rust-500 pl-5">
                <h3 className="text-base font-semibold text-charcoal mb-1">{b.title}</h3>
                <p className="text-sm text-sand-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Real, not slides" title="What we've built so far" align="left" />
          </AnimatedSection>
          <ul className="space-y-3">
            {BUILT.map((b) => (
              <li key={b} className="flex gap-3 text-sm sm:text-base text-sand-600 leading-relaxed">
                <span className="text-turmeric-600 mt-1">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-sand-400">Full feature list with honest status: <a href="/for-retailers" className="text-rust-600 font-medium hover:underline">/for-retailers</a>.</p>
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Coming — with the founder" title="The story behind Kanchuki" align="left" />
          </AnimatedSection>
          <div className="rounded-xl border border-dashed border-sand-300 bg-white p-6 sm:p-8">
            <p className="text-sm sm:text-base text-sand-500 leading-relaxed italic">
              This section will tell the real story — who we are, what we saw in India&apos;s clothing shops, and why this is the thing we chose to build. We won&apos;t publish anything here until it&apos;s true.
            </p>
          </div>
        </div>
      </Section>

      <FinalCta
        title="One photo. One link. One shop that never closes."
        lead="Start your 14-day free trial — your shop can be online tonight."
        secondaryLabel="Meet your customers"
        secondaryHref="/for-customers"
      />
      <Footer />
    </>
  )
}
