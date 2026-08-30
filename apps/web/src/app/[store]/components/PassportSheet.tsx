'use client';

import { motion } from 'framer-motion';
import { Loader2, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

interface GateProfile {
  shop_name: string;
  city?: string | null;
  logo_url?: string | null;
}

interface PassportAccount {
  id: string;
  name: string | null;
  phone_masked: string;
}

interface Props {
  slug: string;
  profile: GateProfile;
  account: PassportAccount;
  onSuccess?: () => void;
}

/**
 * Returning-shopper sheet — shown when the visitor already has a passport
 * session cookie. Displays a greeting, unticked consent toggle, and
 * "Enter catalog" button. The consent toggle is unticked by default
 * (DPDP compliance — consent must be affirmative, never pre-checked).
 */
export function PassportSheet({ slug, profile, account, onSuccess }: Props) {
  const router = useRouter();
  const [shareContact, setShareContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = account.name || 'there';

  const proceed = useCallback(() => {
    if (onSuccess) onSuccess();
    else router.replace(`/${slug}/categories`);
  }, [onSuccess, router, slug]);

  const handleEnter = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // If the user ticked "share contact", POST to leads endpoint
      if (shareContact) {
        const res = await fetch(`/api/${slug}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_account_id: account.id,
            share_contact: true,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: { message?: string } };
          throw new Error(json.error?.message ?? 'Could not share contact');
        }
      }
      // Enter catalog — no lead POST if toggle is off
      proceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 z-50 bg-black/40 flex items-end justify-center px-4 pb-4"
      role="dialog"
      aria-label={`Welcome back to ${profile.shop_name}`}
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        className="bg-white rounded-3xl border border-[#E0E1F6] p-6 max-w-sm w-full shadow-xl"
      >
        {/* Store Logo + Name */}
        <div className="flex items-center gap-3 mb-3">
          {profile.logo_url ? (
            <Image
              src={profile.logo_url}
              alt={profile.shop_name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-cover border border-[#E0E1F6]"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-[#E0E1F6] flex items-center justify-center">
              <span className="text-lg font-bold text-[#231F48] font-marcellus">
                {profile.shop_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h2 className="text-sm leading-5 tracking-[0.02em] font-extrabold text-[#231F48] font-marcellus">
              {profile.shop_name}
            </h2>
            {profile.city && (
              <p className="text-[10px] text-[#6B4773] font-medium">{profile.city}</p>
            )}
          </div>
        </div>

        <p className="text-base font-bold text-[#231F48] mb-1">
          Welcome back, {displayName} ✨
        </p>
        <p className="text-xs text-[#6B4773] mb-4">
          Entering <strong>{profile.shop_name}</strong>
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-3">
            {error}
          </div>
        )}

        {/* Consent toggle — unticked by default (DPDP) */}
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={shareContact}
            onChange={(e) => setShareContact(e.target.checked)}
            className="mt-0.5 accent-[#BB3F95]"
            aria-describedby="consent-desc"
          />
          <span id="consent-desc" className="text-[11px] text-[#6B4773] leading-relaxed">
            Send my contact to {profile.shop_name} for its WhatsApp catalog &amp; updates
          </span>
        </label>

        <button
          type="button"
          onClick={() => void handleEnter()}
          disabled={submitting}
          className="w-full bg-gradient-to-r from-[#231F48] to-[#560A39] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-3xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <ShieldCheck size={14} />
              Enter catalog →
            </>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}
