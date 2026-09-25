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
        <p className="mt-2 text-sm text-carbon/50">Last updated: September 24, 2026</p>

        <div className="mt-8 space-y-6 text-carbon/70">
          <p>
            Kanchuki (&quot;we&quot;, &quot;us&quot;) provides an AI-powered catalog platform for
            clothing retailers in India. This policy explains what we collect from retailers and
            their customers, why, and how it&apos;s handled.
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Why we process your data, and who is responsible</h2>
            <p>
              We process personal data only with your consent (for example, when you tick the
              consent box or create a shopper profile) or for a specific purpose the law permits,
              such as delivering a service you asked for, sending an OTP you requested, or issuing
              a GST invoice. You can withdraw consent at any time; withdrawing does not affect
              what was done before.
            </p>
            <p>
              Kanchuki is responsible (the &ldquo;Data Fiduciary&rdquo; under India&apos;s Digital
              Personal Data Protection Act, 2023) for retailer account data and for shopper
              profiles. For the customer lists a retailer builds inside Kanchuki, the retailer
              decides why the data is used and Kanchuki processes it on the retailer&apos;s behalf.
              We stay responsible for keeping that data secure.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">What we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Retailer account data:</strong> phone number (for OTP login, verified via our
                SMS provider MSG91), business name, address, and GST details (for invoicing).
              </li>
              <li>
                <strong>Shop location (optional):</strong> during onboarding a retailer may tap
                &ldquo;Get Location&rdquo; to capture their shop&apos;s GPS coordinates. This is a
                one-time foreground request &mdash; there is no background tracking. The coordinates
                are used to pre-fill the address and to show a &ldquo;Get directions&rdquo; link on
                the retailer&apos;s public catalog page. Skip the button and no location is collected.
              </li>
              <li>
                <strong>Product photos:</strong> uploaded by retailers to build their catalog.
                Photos are processed by AI vision providers (e.g. Anthropic Claude, OpenAI, Google
                Gemini) to auto-tag category, color, and fabric, and by AI image- and
                video-generation providers to remove or replace backgrounds, generate studio-style
                catalog images, and produce short promotional videos (photo slideshows or
                AI-generated motion) that a retailer may publish to their storefront or connected
                social accounts.
              </li>
              <li>
                <strong>Design reference photos:</strong> retailers may upload design images (for
                example &ldquo;Suits Designs&rdquo; and other design galleries) that are watermarked
                and shown on their public storefront. These are handled like product photos.
              </li>
              <li>
                <strong>KYC documents:</strong> GST certificates and Aadhaar card images you upload
                for seller verification. They are stored securely, used only for verification and
                GST invoicing, and visible only to you and our verification team.
              </li>
              <li>
                <strong>Customer data:</strong> name, phone number, and style/budget preferences
                captured by a retailer when adding a customer to their CRM, or when you share your
                details, submit a review, or send an enquiry on a store&apos;s Kanchuki catalog
                page.
              </li>
              <li>
                <strong>Shopper profile (optional):</strong> if you create a Kanchuki shopper
                profile, we store your phone number, style preferences, and which products you view
                and favourite, to personalise recommendations across participating stores. This is
                consent-based; you can turn off personalisation, export your data, or delete the
                profile at any time from My Profile.
              </li>
              <li>
                <strong>WhatsApp messages:</strong> if a retailer enables WhatsApp catalog sync or
                messaging, product updates are sent to you via Meta&apos;s WhatsApp Business Cloud
                API.
              </li>
              <li>
                <strong>Payment data:</strong> processed directly by Razorpay; Kanchuki does not
                store card or UPI credentials.
              </li>
              <li>
                <strong>AI Stylist conversations:</strong> messages you type to the AI Stylist chat
                are sent to Anthropic Claude to generate product recommendations. They are used only
                to answer that conversation and are not linked to your name unless you&apos;ve shared
                it with the store.
              </li>
              <li>
                <strong>Reviews:</strong> a review you submit, including your name if you provide
                one, is displayed publicly on that product&apos;s page. Your phone number is never
                shown publicly.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">How we use it</h2>
            <p>
              To operate the catalog, customer CRM, WhatsApp collection links, storefront, and AI
              features a retailer has enabled — and nothing beyond that. We do not sell personal
              data. Some AI processing (photo tagging, image generation, the AI Stylist chat) is
              performed by providers located outside India; we only send what&apos;s needed for that
              specific feature.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Cookies &amp; local storage
            </h2>
            <p>
              We use your browser&apos;s local storage (not tracking cookies) to remember that
              you&apos;ve already shared your details with a store, so you&apos;re not asked again,
              and to prefill forms like reviews and enquiries. Clearing your browser data resets
              this.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Your rights</h2>
            <p>
              You can ask us to access, correct, or delete the personal data we hold about you by
              emailing{' '}
              <a href="mailto:privacy@kanchuki.app" className="text-cobalt-600 hover:underline">
                privacy@kanchuki.app
              </a>
              . We will respond within 30 days, subject to the retention obligations
              described below. You can also ask which service providers your data has been shared
              with, ask us to correct inaccurate or incomplete data, and withdraw consent at any
              time. Kanchuki retailer accounts are for users 18 and older; if a
              minor&apos;s details were shared without a parent or guardian&apos;s consent, contact
              us to have them removed.
            </p>
            <p>
              <strong>Right to nominate:</strong> you can name a person to exercise your data
              rights if you die or become unable to. Shopper profile holders can add a nominee in{' '}
              <Link href="/my-profile" className="text-cobalt-600 hover:underline">
                My Profile
              </Link>
              ; retailers can email us at the address below.
            </p>
            <p>
              <strong>Complaints:</strong> if you are not satisfied with our reply to your grievance
              (see below), you may complain to the Data Protection Board of India.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Third parties we share data with
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>AI vision and image-generation providers, to tag product photos and generate
                background-cleaned and studio-style catalog images.</li>
              <li>Cloudflare R2, to store product and KYC images.</li>
              <li>Razorpay, to process payments.</li>
              <li>Supabase, for authentication and database hosting.</li>
              <li>MSG91, to send OTP and transactional SMS.</li>
              <li>Meta (WhatsApp Business Cloud API), where a retailer enables WhatsApp catalog
                sync or messaging.</li>
              <li>Where a retailer connects their own Google Business Profile, Facebook, or Google
                Ads account, product data may be sent to those platforms using the retailer&apos;s
                own credentials.</li>
            </ul>
            <p className="mt-2">
              Each provider that handles personal data for us is bound by a contract that requires
              it to protect that data. Some providers (AI, hosting, SMS) process data outside India;
              transfers are made only for the feature in use and only to the extent Indian law
              permits.
            </p>
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
            <h2 className="font-display text-xl font-semibold text-carbon">
              Product photos and AI training
            </h2>
            <p>
              <strong>We do not use your photos to train AI models.</strong> A photo a
              retailer uploads is used only for the features that retailer asks for —
              auto-tagging category, colour and fabric; background clean-up and studio-style
              catalog images; a short promotional video; and publishing to the storefront or a
              connected social account.
            </p>
            <p>
              That applies to our AI providers too: a photo is sent to a provider only to
              perform the specific operation requested, under a contract that does not permit
              the provider to use it to train its own models. An earlier consent-based
              programme that collected try-on photos for model training was withdrawn and
              removed on 31 August 2026, and no photos are collected for training now.
            </p>
            <p>
              <strong>How long a photo is kept, and how to delete it.</strong> A photo is kept
              while it belongs to a live product, design, or account. Delete the photo or the
              product in the app and it disappears from your catalog immediately; the stored
              file is soft-deleted at once and permanently purged after 15 days — including
              the copy in our write-only recovery vault (see above). Deleting a retailer
              account removes its photos the same way. To have a photo deleted sooner, email{' '}
              <a href="mailto:privacy@kanchuki.app" className="text-cobalt-600 hover:underline">
                privacy@kanchuki.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Security</h2>
            <p>
              We protect personal data with encryption in transit, access controls so that staff
              see only what their job needs, restricted database roles, audit logging of
              sensitive actions, and regular backups. Access is reviewed and revoked when it is no
              longer needed.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Data breaches</h2>
            <p>
              If a personal data breach affects you, we will tell you without delay, explain what
              happened and what you can do, and report it to the Data Protection Board of India as
              the law requires.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Children</h2>
            <p>
              A child is anyone under 18. Kanchuki does not knowingly collect a child&apos;s
              personal data, and shopper profiles and retailer accounts are for people 18 and
              older. Where a child&apos;s data must be processed, we require verifiable consent from
              a parent or guardian, and we do not track or profile children or show them targeted
              advertising.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Keeping data only as long as needed</h2>
            <p>
              We erase personal data once the purpose it was collected for has ended, unless a law
              requires us to keep it (for example GST records).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">Grievance officer</h2>
            <p>
              To raise a complaint about how your data is handled, write to our Grievance Officer at{' '}
              <a href="mailto:privacy@kanchuki.app" className="text-cobalt-600 hover:underline">
                privacy@kanchuki.app
              </a>
              . We acknowledge complaints promptly and resolve them within 30 days.
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
