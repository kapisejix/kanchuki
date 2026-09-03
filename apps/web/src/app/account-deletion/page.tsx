import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Account Deletion | Kanchuki',
  description:
    'How to delete your Kanchuki account and the data associated with it, either from the app or by contacting support.',
};

const SUPPORT_EMAIL = 'support@kanchuki.app';

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-cream text-carbon">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-cobalt-600 hover:underline">
          &larr; Back to Kanchuki
        </Link>

        <h1 className="mt-6 font-display text-3xl font-semibold">Account Deletion</h1>
        <p className="mt-2 text-sm text-carbon/50">Last updated: August 10, 2026</p>

        <div className="mt-8 space-y-6 text-carbon/70">
          <p>
            You can delete your Kanchuki retailer account at any time. Deleting your account
            deactivates your store and removes your collection links from the public storefront.
            Some records are retained where we are legally required to do so — see &ldquo;What
            happens to your data&rdquo; below.
          </p>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Option 1 — Delete from the app (recommended)
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                Open the Kanchuki app and go to <strong>Settings</strong>.
              </li>
              <li>
                Scroll to the bottom and tap <strong>Delete Account</strong>.
              </li>
              <li>
                Type <code className="rounded bg-white px-1.5 py-0.5 text-sm">DELETE</code> to
                confirm.
              </li>
              <li>Your account is deactivated immediately.</li>
            </ol>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              Option 2 — Request deletion by email
            </h2>
            <p className="mt-2">
              If you no longer have access to the app, email us at{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`}
                className="text-cobalt-600 underline"
              >
                {SUPPORT_EMAIL}
              </a>{' '}
              from the phone number registered on your account, with the subject line &ldquo;Account
              deletion request&rdquo;. We&rsquo;ll verify your identity and process the deletion
              within 7 business days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-carbon">
              What happens to your data
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                Your account, profile, product catalog, customers, and collection links are removed
                or deactivated so they are no longer publicly accessible.
              </li>
              <li>
                A small set of records may be retained where we are legally required to do so — for
                example GST invoices and transaction records needed for tax compliance — and for a
                limited time for fraud and abuse prevention. These records are not publicly visible
                and are not used for any commercial purpose.
              </li>
              <li>
                Customer data you collected (e.g. customer profiles and preferences) is deleted as
                part of your account deletion.
              </li>
            </ul>
            <p className="mt-3 text-sm">
              See our{' '}
              <Link href="/privacy" className="text-cobalt-600 underline">
                Privacy Policy
              </Link>{' '}
              for full details on how we collect, use, and retain data.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
