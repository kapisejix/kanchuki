'use client';

import { motion } from 'framer-motion';
import { Loader2, Eye, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getPassport, type PassportSession } from '@/lib/passport-client';
import { PassportSheet } from './PassportSheet';

// Narrowed to just the fields this form actually renders
interface GateProfile {
  shop_name: string;
  city?: string | null;
  logo_url?: string | null;
}

interface Props {
  slug: string;
  profile: GateProfile;
  onSuccess?: () => void;
}

type Gender = 'MALE' | 'FEMALE';

const leadKey = (slug: string) => `kanchuki_lead_${slug}`;
const leadNameKey = (slug: string) => `kanchuki_lead_name_${slug}`;
const leadPhoneKey = (slug: string) => `kanchuki_lead_phone_${slug}`;

export function ContactGate({ slug, profile, onSuccess }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [passportSession, setPassportSession] = useState<PassportSession | null>(null);
  const [showPassportSheet, setShowPassportSheet] = useState(false);
  const [justBrowsing, setJustBrowsing] = useState(false);

  // Legacy form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP state
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const proceed = useCallback(() => {
    if (onSuccess) onSuccess();
    else router.replace(`/${slug}/categories`);
  }, [onSuccess, router, slug]);

  // Check passport session + legacy localStorage
  useEffect(() => {
    // Already submitted details for this store before — skip
    const alreadySubmitted = localStorage.getItem(leadKey(slug));
    if (alreadySubmitted) {
      proceed();
      return;
    }

    // Check passport session
    getPassport()
      .then((session) => {
        if (session) {
          setPassportSession(session);
          setShowPassportSheet(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [slug, proceed]);

  // Legacy form submit
  const canSubmit =
    name.trim().length > 0 && phone.trim().length >= 10 && gender !== null && consent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/${slug}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), gender, consent }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Could not submit your details');
      }
      localStorage.setItem(leadKey(slug), '1');
      localStorage.setItem(leadNameKey(slug), name.trim());
      localStorage.setItem(leadPhoneKey(slug), phone.trim());
      proceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  // OTP send
  const handleSendOtp = async () => {
    if (otpPhone.trim().length < 10) return;
    setOtpSending(true);
    setOtpError(null);
    try {
      const res = await fetch('/api/passport/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to send OTP');
      }
      setOtpStep('otp');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setOtpSending(false);
    }
  };

  // OTP verify
  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch('/api/passport/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone.trim(), otp: otpCode.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Invalid OTP');
      }
      // OTP verified — now show the PassportSheet
      const meRes = await fetch('/api/passport/me', { credentials: 'include' });
      if (meRes.ok) {
        const data = (await meRes.json()) as { account?: PassportSession['account'] };
        if (data.account) {
          setPassportSession({ account: data.account });
          setShowPassportSheet(true);
          setOtpStep('phone');
          setOtpPhone('');
          setOtpCode('');
        }
      }
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setOtpVerifying(false);
    }
  };

  // "Just browse" — enter catalog without passport
  const handleJustBrowse = () => {
    setJustBrowsing(true);
    proceed();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7FC] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#BB3F95]" />
      </div>
    );
  }

  // Returning shopper — PassportSheet overlay
  if (showPassportSheet && passportSession && !justBrowsing) {
    return (
      <PassportSheet
        slug={slug}
        profile={profile}
        account={passportSession.account}
        onSuccess={onSuccess}
      />
    );
  }

  // Just browsing — let them through (gate is disarmed)
  if (justBrowsing) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen bg-[#F8F7FC] flex flex-col items-center justify-center px-6 relative"
    >
      <Link
        href="/"
        className="absolute top-6 left-6 text-xs font-bold text-[#6B4773] hover:text-[#231F48] flex items-center gap-1 uppercase tracking-wider"
      >
        ← Back
      </Link>

      {otpStep === 'phone' ? (
        /* ─── First-time: phone + OTP ─── */
        <div className="bg-white rounded-3xl border border-[#E0E1F6] p-7 max-w-sm w-full shadow-sm">
          {/* Store Logo + Name */}
          <div className="flex items-center gap-3.5 mb-4">
            {profile.logo_url ? (
              <Image
                src={profile.logo_url}
                alt={profile.shop_name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-2xl object-cover border border-[#E0E1F6]"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[#E0E1F6] flex items-center justify-center">
                <span className="text-xl font-bold text-[#231F48] font-marcellus">
                  {profile.shop_name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-base leading-6 tracking-[0.02em] font-extrabold text-[#231F48] font-marcellus">
                {profile.shop_name}
              </h1>
              {profile.city && (
                <p className="text-xs text-[#6B4773] font-medium">{profile.city}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-[#6B4773] mb-5">
            Verify once, access 500+ boutiques instantly.
          </p>

          {otpError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-4">
              {otpError}
            </div>
          )}

          <label
            htmlFor="otp-phone"
            className="block text-[10px] font-bold text-[#6B4773] uppercase tracking-wider mb-1"
          >
            WhatsApp Number
          </label>
          <input
            id="otp-phone"
            value={otpPhone}
            onChange={(e) => setOtpPhone(e.target.value)}
            type="tel"
            inputMode="numeric"
            minLength={10}
            className="w-full bg-[#F8F7FC] border border-[#E0E1F6] rounded-2xl px-4 py-3 text-sm text-[#231F48] mb-4 focus:outline-none focus:border-[#BB3F95]"
            placeholder="10-digit mobile number"
          />

          <button
            type="button"
            onClick={() => void handleSendOtp()}
            disabled={otpPhone.trim().length < 10 || otpSending}
            className="w-full bg-gradient-to-r from-[#231F48] to-[#560A39] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-3xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] mb-3"
          >
            {otpSending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={14} />}
            {otpSending ? 'Sending...' : 'Verify with OTP'}
          </button>

          <button
            type="button"
            onClick={() => void handleJustBrowse()}
            className="w-full bg-transparent text-[#6B4773] font-bold text-xs uppercase tracking-wider py-3 rounded-3xl flex items-center justify-center gap-2 border border-[#E0E1F6] hover:bg-[#F8F7FC] transition-all"
          >
            <Eye size={14} />
            Skip — just browse
          </button>
        </div>
      ) : (
        /* ─── OTP verification step ─── */
        <div className="bg-white rounded-3xl border border-[#E0E1F6] p-7 max-w-sm w-full shadow-sm">
          <h2 className="text-base font-extrabold text-[#231F48] font-marcellus mb-1">
            Enter OTP
          </h2>
          <p className="text-xs text-[#6B4773] mb-5">
            Sent to {otpPhone.replace(/(\d{2})\d+(\d{3})/, '$1****$2')}
          </p>

          {otpError && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-4">
              {otpError}
            </div>
          )}

          <label
            htmlFor="otp-code"
            className="block text-[10px] font-bold text-[#6B4773] uppercase tracking-wider mb-1"
          >
            6-digit code
          </label>
          <input
            id="otp-code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            type="tel"
            inputMode="numeric"
            maxLength={6}
            className="w-full bg-[#F8F7FC] border border-[#E0E1F6] rounded-2xl px-4 py-3 text-sm text-[#231F48] mb-4 text-center tracking-[0.3em] font-mono focus:outline-none focus:border-[#BB3F95]"
            placeholder="------"
            autoFocus
          />

          <button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={otpCode.trim().length !== 6 || otpVerifying}
            className="w-full bg-gradient-to-r from-[#231F48] to-[#560A39] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-3xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] mb-3"
          >
            {otpVerifying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ShieldCheck size={14} />
            )}
            {otpVerifying ? 'Verifying...' : 'Verify & Enter'}
          </button>

          <button
            type="button"
            onClick={() => { setOtpStep('phone'); setOtpError(null); }}
            className="w-full bg-transparent text-[#6B4773] font-bold text-xs uppercase tracking-wider py-3 rounded-3xl border border-[#E0E1F6] hover:bg-[#F8F7FC] transition-all"
          >
            ← Change number
          </button>
        </div>
      )}

      {/* ─── Legacy form (hidden when passport flow is active) ─── */}
      {!passportSession && (
        <details className="mt-4 max-w-sm w-full">
          <summary className="text-[10px] text-[#6B4773] cursor-pointer hover:text-[#231F48] text-center">
            Or share your details manually →
          </summary>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="bg-white rounded-3xl border border-[#E0E1F6] p-7 mt-3 shadow-sm"
          >
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <label
              htmlFor="contact-name"
              className="block text-[10px] font-bold text-[#6B4773] uppercase tracking-wider mb-1"
            >
              Your Name
            </label>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-[#F8F7FC] border border-[#E0E1F6] rounded-2xl px-4 py-3 text-sm text-[#231F48] mb-4 focus:outline-none focus:border-[#BB3F95]"
              placeholder="e.g. Ananya Sharma"
            />

            <label
              htmlFor="contact-phone"
              className="block text-[10px] font-bold text-[#6B4773] uppercase tracking-wider mb-1"
            >
              WhatsApp Number
            </label>
            <input
              id="contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              minLength={10}
              className="w-full bg-[#F8F7FC] border border-[#E0E1F6] rounded-2xl px-4 py-3 text-sm text-[#231F48] mb-4 focus:outline-none focus:border-[#BB3F95]"
              placeholder="10-digit mobile number"
            />

            <p className="block text-[10px] font-bold text-[#6B4773] uppercase tracking-wider mb-2">
              Gender
            </p>
            <div className="flex gap-3 mb-4">
              {(['MALE', 'FEMALE'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={`flex-1 rounded-2xl py-3 text-xs font-bold uppercase tracking-wider border transition-all ${
                    gender === g
                      ? 'bg-[#231F48] text-white border-[#231F48] shadow-sm'
                      : 'bg-[#F8F7FC] text-[#231F48] border-[#E0E1F6]'
                  }`}
                >
                  {g === 'MALE' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>

            <label className="flex items-start gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
                className="mt-0.5"
              />
              <span className="text-[11px] text-[#6B4773] leading-relaxed">
                I agree to receive personalized collection updates from {profile.shop_name} on WhatsApp.
              </span>
            </label>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full bg-gradient-to-r from-[#231F48] to-[#560A39] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 rounded-3xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Enter Catalog →'}
            </button>
          </form>
        </details>
      )}
    </motion.div>
  );
}
