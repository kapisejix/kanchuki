'use client';

// Phase 3 (D7): the Style Passport, one place for what My Style knows about the shopper.
// The colour block is the same PaletteCard the My Style result uses (not rebuilt); the
// camera, drape test and quiz stay on /my-style, so every action here links there.
// Never shows a body or skin label (frame stays hidden, research §7.1).
import { BadgeCheck, Check, ChevronRight, Circle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PaletteCard } from '../my-style/PaletteCard';
import { TasteCard } from '../my-style/TasteCard';
import { type ProfileResult, fetchProfile } from '../my-style/analyze';
import { BTN_SECONDARY, CARD } from '../ui';

type Saved = Extract<ProfileResult, { kind: 'ok' }>['data'];
type Gender = 'FEMALE' | 'MALE' | null;

const STEPS = [
  { key: 'colours', label: 'Colours', unlocks: 'Shades that suit you, first in your feed' },
  { key: 'size', label: 'Size', unlocks: 'Your size shown on products (coming soon)' },
  { key: 'taste', label: 'Taste', unlocks: 'Occasions and fabrics you like, ranked higher' },
] as const;

const LINK_CARD = `${CARD} p-4 flex items-center gap-2 text-sm font-semibold text-fuchsia-600`;

/** Three steps; "Show me" is a setting, not a step ("Both" is stored as null, like unset). */
export function completeness(p: Saved, usualSize: string | null, prefStyles: string[]) {
  const done = {
    colours: !!p.style_profile,
    size: !!p.measurements || !!usualSize,
    taste: !!p.taste || prefStyles.length > 0,
  };
  const steps = STEPS.map((s) => ({ key: s.key, done: done[s.key] }));
  return { done: steps.filter((s) => s.done).length, total: 3 as const, steps };
}

const SHOW_ME: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: "Women's wear" },
  { value: 'MALE', label: "Men's wear" },
  { value: null, label: 'Both' },
];

export function StylePassport({
  gender: initialGender,
  usualSize,
  prefStyles,
}: {
  gender: Gender;
  usualSize: string | null;
  prefStyles: string[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [nonce, setNonce] = useState(0);
  const [gender, setGender] = useState<Gender>(initialGender);
  const [genderError, setGenderError] = useState(false);
  const savingRef = useRef(false); // two taps can land before state commits (RC-015)

  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is the retry trigger
  useEffect(() => {
    const ctrl = new AbortController();
    setStatus('loading');
    fetchProfile(ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (r.kind === 'ok') {
        setSaved(r.data);
        setStatus('ok');
      } else setStatus('error');
    });
    return () => ctrl.abort();
  }, [nonce]);

  async function pickGender(next: Gender) {
    if (savingRef.current || next === gender) return;
    savingRef.current = true;
    const before = gender;
    setGender(next);
    setGenderError(false);
    let ok = false;
    try {
      const res = await fetch('/api/passport/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender: next }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    savingRef.current = false;
    if (!ok) {
      setGender(before);
      setGenderError(true);
    }
  }

  const progress = saved ? completeness(saved, usualSize, prefStyles) : null;
  const m = saved?.measurements;

  return (
    <section id="passport" aria-labelledby="passport-title" className="space-y-3 scroll-mt-4">
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <h2
            id="passport-title"
            className="text-base font-bold text-spaceCadet-900 inline-flex items-center gap-2"
          >
            <BadgeCheck aria-hidden className="h-5 w-5 text-fuchsia-600" />
            Style Passport
          </h2>
          <Link
            href="/my-style"
            className="text-sm font-semibold text-fuchsia-600 inline-flex items-center gap-0.5"
          >
            Open My Style
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>

        {status === 'loading' && !saved && (
          <p className="text-sm text-heliotrope-500 mt-3 inline-flex items-center gap-2">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            Loading your style profile
          </p>
        )}
        {status === 'error' && (
          <div role="alert" className="mt-3 flex items-center gap-3">
            <p className="text-sm text-red-700">Couldn&apos;t load your style profile.</p>
            <button type="button" onClick={() => setNonce((n) => n + 1)} className={BTN_SECONDARY}>
              Retry
            </button>
          </div>
        )}

        {progress && (
          <>
            <p className="text-sm font-semibold text-spaceCadet-900 mt-3">
              {progress.done} of {progress.total} done
            </p>
            <progress
              aria-label="Profile complete"
              max={progress.total}
              value={progress.done}
              className="block w-full h-2 mt-1.5 overflow-hidden rounded-full bg-lavender-100 appearance-none [&::-webkit-progress-bar]:bg-lavender-100 [&::-webkit-progress-value]:bg-fuchsia-600 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-fuchsia-600"
            />

            <ul className="mt-3 space-y-1.5">
              {STEPS.map((s) => {
                const done = progress.steps.find((x) => x.key === s.key)?.done;
                return (
                  <li key={s.key} className="flex items-start gap-2 text-sm">
                    {done ? (
                      <Check aria-hidden className="h-4 w-4 mt-0.5 text-fuchsia-600" />
                    ) : (
                      <Circle aria-hidden className="h-4 w-4 mt-0.5 text-heliotrope-400" />
                    )}
                    <span>
                      <span className="font-semibold text-spaceCadet-900">{s.label}</span>
                      {!done && <span className="text-heliotrope-500"> · {s.unlocks}</span>}
                      <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-spaceCadet-900">Show me</legend>
          <p className="text-xs text-heliotrope-500">
            Sets what your My Style feed shows first. You can still see everything.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {SHOW_ME.map((o) => (
              <label
                key={o.label}
                className="relative inline-flex items-center rounded-full border border-lavender-200 px-3 py-1.5 text-sm text-spaceCadet-900 has-[:checked]:bg-spaceCadet-900 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-fuchsia-500/50"
              >
                <input
                  type="radio"
                  name="show-me"
                  className="sr-only"
                  checked={gender === o.value}
                  onChange={() => void pickGender(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          {genderError && (
            <p role="alert" className="text-xs text-red-700 mt-2">
              Couldn&apos;t save. Try again.
            </p>
          )}
        </fieldset>
      </div>

      {saved && (
        <>
          {saved.style_profile ? (
            <PaletteCard
              profile={saved.style_profile}
              onRetake={() => router.push('/my-style?retake=1')}
              onShop={() => router.push('/my-style?palette=1')}
              onCleared={() => setNonce((n) => n + 1)}
            />
          ) : (
            <Link href="/my-style?retake=1" className={LINK_CARD}>
              Find your colours with one face photo
              <ChevronRight aria-hidden className="h-4 w-4 ml-auto" />
            </Link>
          )}

          {m || usualSize ? (
            <div className={`${CARD} p-4 text-sm`}>
              <p className="font-semibold text-spaceCadet-900">Your size</p>
              <p className="text-heliotrope-500 mt-1">
                {[
                  usualSize ? `Usual size ${usualSize}` : null,
                  m?.height_cm ? `Height ${m.height_cm} cm` : null,
                  m?.bust_cm ? `Bust ${m.bust_cm} cm` : null,
                  m?.waist_cm ? `Waist ${m.waist_cm} cm` : null,
                  m?.hip_cm ? `Hip ${m.hip_cm} cm` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Link href="/my-style" className="text-fuchsia-600 font-semibold mt-2 inline-block">
                Update
              </Link>
            </div>
          ) : (
            <Link href="/my-style" className={LINK_CARD}>
              Add your size
              <ChevronRight aria-hidden className="h-4 w-4 ml-auto" />
            </Link>
          )}

          {saved.taste ? (
            <TasteCard taste={saved.taste} onChange={() => router.push('/my-style')} />
          ) : (
            <Link href="/my-style" className={LINK_CARD}>
              Take the quick quiz
              <ChevronRight aria-hidden className="h-4 w-4 ml-auto" />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
