import type { Metadata } from 'next'
import { MessageCircle, Mail } from 'lucide-react'
import { Navbar, Footer, Section, SectionHeader, AnimatedSection, PageHero } from '@/components/site/Chrome'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact — How to Reach Kanchuki | Kanchuki',
  description:
    'WhatsApp, email, or a quick form — talk to a real person about Kanchuki for your clothing store. Business hours 10 AM–7 PM IST.',
}

// WhatsApp business number isn't configured yet (no wa.me link exists
// anywhere else in this codebase either) — the honesty gate in
// docs/content/pages/content-style-guide.md forbids inventing one, so the
// WhatsApp card only appears once NEXT_PUBLIC_WHATSAPP_NUMBER is set.
const WHATSAPP_NUMBER = process.env['NEXT_PUBLIC_WHATSAPP_NUMBER']

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <PageHero
        title="Talk to a human."
        lead="Questions about Kanchuki for your shop? Want help getting started? We're real people, and we answer — during business hours (10 AM–7 PM IST, Monday–Saturday)."
      />

      <Section>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`grid gap-6 mb-14 ${WHATSAPP_NUMBER ? 'sm:grid-cols-2' : 'sm:grid-cols-1 max-w-sm mx-auto'}`}>
            {WHATSAPP_NUMBER && (
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-carbon/10 bg-white p-6 sm:p-8 hover:-translate-y-0.5 hover:border-cobalt-500 transition-all duration-300"
              >
                <MessageCircle size={24} strokeWidth={1.5} className="text-cobalt-600 mb-3" />
                <h3 className="font-display text-base font-semibold text-carbon mb-1">WhatsApp — fastest</h3>
                <p className="text-sm text-carbon/60 leading-relaxed">Best for quick questions, screenshots of your shop, getting set up. We reply in business hours.</p>
              </a>
            )}
            <a href="mailto:support@kanchuki.app" className="rounded-2xl border border-carbon/10 bg-white p-6 sm:p-8 hover:-translate-y-0.5 hover:border-cobalt-500 transition-all duration-300">
              <Mail size={24} strokeWidth={1.5} className="text-cobalt-600 mb-3" />
              <h3 className="font-display text-base font-semibold text-carbon mb-1">Email</h3>
              <p className="text-sm text-carbon/60 leading-relaxed">support@kanchuki.app — best for longer questions, billing, partnership ideas.</p>
            </a>
          </div>

          <AnimatedSection>
            <SectionHeader tag="Send a message" title="This form actually works" subtitle="It stores your message where the team sees it. No simulated submit." align="left" />
          </AnimatedSection>
          <ContactForm />
        </div>
      </Section>

      <Section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection>
            <SectionHeader tag="After you write" title="What happens next" align="left" />
          </AnimatedSection>
          <ol className="space-y-3 list-decimal list-inside text-sm sm:text-base text-carbon/70 leading-relaxed">
            <li>We read it the same day (business hours).</li>
            <li>If it&apos;s about your shop, we&apos;ll ask for your store link or phone number to look at your account.</li>
            <li>We reply on the channel you used — WhatsApp or email.</li>
          </ol>
          <p className="mt-8 text-sm text-carbon/60">Prefer to just try it? <a href="/pricing" className="text-cobalt-600 font-semibold hover:underline">Start your 14-day free trial</a> — no card, cancel anytime.</p>
        </div>
      </Section>
      <Footer />
    </>
  )
}
