import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Kanchuki',
  description: 'How Kanchuki collects, uses, and protects retailer and customer data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-cream text-carbon">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-cobalt-600 hover:underline">
          &larr; Back to Kanchuki
        </Link>

        <h1 className="mt-6 font-display text-3xl font-semibold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-carbon/50">Last updated: August 24, 2026</p>

        <div className="mt-8 space-y-6 text-carbon/70">
          <p>
            Kanchuki (&quot;we&quot;, &quot;us&quot;) provides an AI-powered catalog and commerce
            platform for clothing retailers in India. This policy explains what we collect from
            retailers and their customers, why, and how it&apos;s handled.
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">What we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Retailer account data:</strong> phone number (for OTP login, verified via our
                SMS provider MSG91), business name, address, and GST details (for invoicing).
              </li>
              <li>
                <strong>Product photos:</strong> uploaded by retailers to build their catalog.
                Photos are processed by AI vision providers (e.g. Anthropic Claude, OpenAI, Google
                Gemini) to auto-tag category, color, and fabric, and by AI image-generation providers
                to remove backgrounds, generate ghost-mannequin/studio-shoot images, and power virtual
                try-on.
              </li>
              <li>
                <strong>KYC documents:</strong> GST certificates and Aadhaar card images you upload
                for seller verification. They are stored securely, used only for verification and
                GST invoicing, and visible only to you and our verification team.
              </li>
              <li>
                <strong>Measurement photos:</strong> with your explicit consent, front and back body
                photos used to estimate measurements for virtual try-on sizing. Both the photos and
                the extracted measurements are stored securely and can be deleted.
              </li>
              <li>
                <strong>Customer data:</strong> name, phone number, and style/budget preferences
                captured by a retailer when adding a customer to their CRM, or when you share your
                details, book a visit, submit a review, or request a referral code on a store&apos;s
                Kanchuki catalog page.
              </li>
              <li>
                <strong>WhatsApp messages:</strong> if a retailer enables WhatsApp catalog sync or
                messaging, product and order updates are sent to you via Meta&apos;s WhatsApp Business
                Cloud API.
              </li>
              <li>
                <strong>Try-on photos:</strong> only collected with your explicit consent, used to
                generate virtual try-on previews. You can revoke this consent at any time from{' '}
                <Link href="/consent/revoke" className="text-cobalt-600 hover:underline">
                  the consent management page
                </Link>
                .
              </li>
              <li>
                <strong>Payment data:</strong> processed directly by Razorpay; Kanchuki does not
                store card or UPI credentials.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">How we use it</h2>
            <p>
              To operate the catalog, customer CRM, WhatsApp collection links, checkout, and virtual
              try-on features a retailer has enabled — and nothing beyond that. We do not sell
              personal data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Third parties we share data with
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>AI vision and image-generation providers, to tag product photos, extract body
                measurements, and generate studio/try-on images.</li>
              <li>Cloudflare R2, to store product, KYC, and try-on images.</li>
              <li>Razorpay, to process payments.</li>
              <li>Supabase, for authentication and database hosting.</li>
              <li>MSG91, to send OTP and transactional SMS.</li>
              <li>Meta (WhatsApp Business Cloud API), where a retailer enables WhatsApp catalog
                sync or messaging.</li>
              <li>Where a retailer connects their own Google Business Profile, Facebook, or Google
                Ads account, product data may be sent to those platforms using the retailer&apos;s
                own credentials.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Deletion &amp; retention
            </h2>
            <p>
              Deleted products, customers, and photos are soft-deleted immediately and permanently
              purged after 15 days. A copy is kept in a write-only backup vault for that period in
              case of accidental deletion, then it is purged too.
            </p>
            <p>
              GST numbers, KYC documents, and invoicing records are retained as required by Indian
              tax law and our record-keeping obligations — including after account deletion — as
              described on our{' '}
              <Link href="/account-deletion" className="text-cobalt-600 hover:underline">
                account deletion page
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Contact</h2>
            <p>
              Questions about this policy or your data:{' '}
              <a href="mailto:privacy@kanchuki.app" className="text-cobalt-600 hover:underline">
                privacy@kanchuki.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
