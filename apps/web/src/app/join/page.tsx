import { Footer, Navbar, Section } from '@/components/site/Chrome';
import { API_URL as apiUrl } from '@/lib/apiUrl';
import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// docs/tasks/staff-invite-tokens.md §7 — web /join bridge. The invite link a
// retailer shares is kanchuki://join?token=… (custom scheme, D6). When the
// member doesn't have the app installed, the platform falls back to
// https://kanchuki.app/join?token=… — this page shows who/what the invite is
// for and bridges to the app (Open in app + store badges). NO OTP on web:
// staff are a mobile-app surface; this page only ever points at the app.

interface Props {
  searchParams: Promise<{ token?: string }>;
}

type InviteInfo = {
  shop_name: string | null;
  member_name: string;
  role: string;
  phone_masked: string;
  status: 'pending' | 'used' | 'expired' | 'revoked';
};

async function fetchInvite(token: string): Promise<InviteInfo | null> {
  try {
    const res = await fetch(`${apiUrl}/v1/public/staff-invite/${encodeURIComponent(token)}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: InviteInfo };
    return json.data;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: 'Join your store team | Kanchuki',
  description: 'Accept your store invite and get the Kanchuki app.',
};

export default async function JoinPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) notFound();
  const invite = await fetchInvite(token);
  // 404 / expired / revoked / used all render the same dead-end family below
  // (an unknown hash must not be distinguishable from an expired one — the
  // API returns 404 for both, and we mirror that here).
  if (!invite) notFound();

  const deepLink = `kanchuki://join?token=${encodeURIComponent(token)}`;
  const openInApp = `intent://join?token=${encodeURIComponent(token)}#Intent;scheme=kanchuki;package=in.kanchuki.app;end`;

  return (
    <>
      <Navbar />
      <Section>
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="rounded-3xl border border-carbon/10 bg-white p-8 sm:p-12 text-center shadow-sm">
            {invite.status === 'used' ? (
              <>
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Smartphone size={26} strokeWidth={1.5} className="text-emerald-600" />
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-carbon">
                  You&apos;ve already joined
                </h1>
                <p className="text-sm sm:text-base text-carbon/60 leading-relaxed mt-3">
                  This invite was already used. Open the Kanchuki app and log in with your phone to
                  get back to {invite.shop_name ?? 'your store'}.
                </p>
              </>
            ) : invite.status === 'expired' || invite.status === 'revoked' ? (
              <>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-carbon">
                  This invite link is no longer valid
                </h1>
                <p className="text-sm sm:text-base text-carbon/60 leading-relaxed mt-3">
                  Invites expire after 7 days. Ask the store owner to send you a fresh one.
                </p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-cobalt-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Smartphone size={26} strokeWidth={1.5} className="text-white" />
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-carbon">
                  {invite.member_name}, you&apos;ve been added to {invite.shop_name ?? 'the store'}
                </h1>
                <p className="text-sm sm:text-base text-carbon/60 leading-relaxed mt-3">
                  Join as <span className="font-semibold text-carbon">{invite.role}</span>.
                  We&apos;ll send a one-time password to {invite.phone_masked} — you&apos;ll never
                  need a password.
                </p>

                <a
                  href={deepLink}
                  className="inline-flex items-center justify-center bg-volt text-carbon font-semibold px-8 py-3.5 rounded-full mt-8 hover:bg-volt-600 transition active:scale-[0.97]"
                >
                  Open in Kanchuki app
                </a>
                <p className="text-xs text-carbon/40 mt-3">
                  Opening the invite link needs the Kanchuki app.
                </p>
                <a
                  href={openInApp}
                  className="mt-6 inline-flex items-center justify-center rounded-full border border-carbon/20 px-6 py-3 text-sm font-semibold text-carbon hover:bg-carbon/5 transition"
                >
                  Open with Android app
                </a>
                <p className="text-xs text-carbon/40 mt-6 leading-relaxed">
                  Don&apos;t have the app? Ask the store owner for the Android early-access link.
                </p>
              </>
            )}
          </div>
        </div>
      </Section>
      <Footer />
    </>
  );
}
