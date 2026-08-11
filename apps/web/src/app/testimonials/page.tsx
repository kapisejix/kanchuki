import type { Metadata } from 'next'
import { Navbar, Footer, Section, SectionHeader, SelvedgeCard, AnimatedSection, FinalCta, PageHero } from '@/components/site/Chrome'
import { LiveStats } from './LiveStats'

export const metadata: Metadata = {
  title: 'Retailer Stories & Reviews | Kanchuki',
  description:
    'Real stories from real clothing stores on Kanchuki — how shops photograph, tag and share their catalogs on WhatsApp. Verified, never invented.',
}

const VERIFICATION = [
  'The retailer is a confirmed account on the platform (their store page is live).',
  'Their quote references something checkable — products uploaded, a link shared, an enquiry answered.',
  'They\'ve agreed to be named with their shop and city.',
  'Anything we can\'t verify doesn\'t get published. Simple rule.',
]

export default function TestimonialsPage() {
  return (
    <>
      <Navbar />
      <PageHero
        tag="Testimonials"
        title="What stores say about Kanchuki."
        lead="We only publish what real shops have told us — with their names, their shops, and their cities. Until those stories exist, this page shows real proof of a different kind: live numbers and real stores, straight from the platform."
      />

      <Section id="real-proof">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="Until real stories exist" title="Real proof instead" subtitle="Live platform stats — these change daily and cannot be invented." />
          </AnimatedSection>
          <LiveStats />
        </div>
      </Section>

      <Section className="bg-sand-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="No fabricated testimonials" title="How stories get verified" subtitle="So you can trust them." />
          </AnimatedSection>
          <SelvedgeCard accent="turmeric" className="p-6 sm:p-8">
            <ul className="space-y-3">
              {VERIFICATION.map((v) => (
                <li key={v} className="flex gap-3 text-sm text-sand-600 leading-relaxed">
                  <span className="text-turmeric-600 mt-0.5">✓</span>
                  <span>{v}</span>
                </li>
              ))}
            </ul>
          </SelvedgeCard>
        </div>
      </Section>

      <FinalCta
        title="Want to share your story?"
        lead="If you're a Kanchuki store owner, tell us what changed for your shop. Real stories help other shops decide — and we'd love to feature you."
        primaryLabel="Contact us"
        primaryHref="/contact"
        secondaryLabel="Start your own free trial"
        secondaryHref="/pricing"
      />
      <Footer />
    </>
  )
}
