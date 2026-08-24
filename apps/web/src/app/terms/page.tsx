import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service | Kanchuki',
  description: 'The terms that govern your use of the Kanchuki catalog and commerce platform.',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-cream text-carbon">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-cobalt-600 hover:underline">
          &larr; Back to Kanchuki
        </Link>

        <h1 className="mt-6 font-display text-3xl font-semibold">Terms of Service</h1>
        <p className="mt-2 text-sm text-carbon/50">Last updated: August 24, 2026</p>

        <div className="mt-8 space-y-6 text-carbon/70">
          <p>
            These terms govern your use of Kanchuki, the AI-powered catalog and commerce platform
            for clothing retailers in India. By creating an account or continuing to use the
            platform, you agree to these terms. If you do not agree, please do not use the service.
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">1. Eligibility &amp; accounts</h2>
            <p>
              You must be at least 18 years old and authorised to run the business you register to
              use Kanchuki. You are responsible for keeping your login credentials secure and for
              all activity under your account.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">2. The service</h2>
            <p>
              Kanchuki provides tools to catalogue products, auto-tag photos using AI, manage
              customers, share collections via WhatsApp, and accept enquiries and orders from your
              customers. Features may change over time; we will communicate material changes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">3. Your content</h2>
            <p>
              You retain ownership of the product photos and data you upload. You grant Kanchuki a
              limited licence to store, process, and display that content solely to operate the
              service (including sending it to AI providers for auto-tagging). You confirm you have
              the rights to upload the content you publish, including customer photos taken with
              their consent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">4. Payments &amp; billing</h2>
            <p>
              Subscription plans are billed in INR via Razorpay, monthly or annually. Amounts paid
              are non-refundable except where required by law. Where you connect your own payment
              account for customer checkout, sale proceeds are settled directly to you; Kanchuki
              never holds retailer sale money.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">5. GST invoicing</h2>
            <p>
              You are responsible for the accuracy of the GST details on your account. Kanchuki
              generates GST invoices on your behalf when you sell; you remain responsible for
              filing and paying applicable taxes on your sales.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              6. Customer communications
            </h2>
            <p>
              When a customer shares their name and phone number on a retailer&apos;s Kanchuki
              catalog page — to view a collection, submit a review, book a visit, or request a
              referral code — they consent to Kanchuki and that retailer contacting them by phone,
              SMS, or WhatsApp about products, offers, orders, and AI styling features, as described
              in our{' '}
              <Link href="/privacy" className="text-cobalt-600 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">7. Acceptable use</h2>
            <p>
              Do not misuse the platform: don&apos;t upload unlawful, infringing, or deceptive
              content, don&apos;t attempt to access another retailer&apos;s data, and don&apos;t
              use the service to harass customers. We may suspend accounts that violate these
              rules, with notice where possible.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">8. Availability &amp; liability</h2>
            <p>
              We work to keep the service available, but provide it &quot;as is&quot; without
              warranties of uninterrupted availability. To the maximum extent permitted by law,
              Kanchuki is not liable for indirect or consequential losses arising from your use of
              the service.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">9. Changes to these terms</h2>
            <p>
              We may update these terms from time to time. Continued use of Kanchuki after changes
              are posted constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Contact</h2>
            <p>
              Questions about these terms:{' '}
              <a href="mailto:support@kanchuki.app" className="text-cobalt-600 hover:underline">
                support@kanchuki.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
