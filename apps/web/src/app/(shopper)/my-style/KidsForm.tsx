// F-045 D4: the parent describes a child's need in a form. There is no photo
// path here at all — no file input, no camera — and nothing is stored: the
// values live in page state for the visit only.
//
// Gender narrows the feed and age boosts closer age groups (never filters:
// kids' sizing varies by store); occasion and budget work as for adults.

'use client';

import { formatPriceRange } from '@kanchuki/shared';
import { useState } from 'react';
import { BTN_PRIMARY, SELECT } from '../ui';

export const KIDS_WHO = ['Girl', 'Boy'] as const;
export const KIDS_AGES = ['0–2 yrs', '3–5 yrs', '6–8 yrs', '9–12 yrs', '13–16 yrs'] as const;
const OCCASIONS = ['Daily Wear', 'Party / Festive', 'Wedding / Bridal', 'School / Formal'];
const BUDGETS = [50000, 100000, 200000, 300000, 500000];

export interface KidsNeed {
  who: string;
  age: string;
  occasion: string;
  budget: string; // paise as a string, '' = any
}

const select = `${SELECT} w-full min-w-0`;

export function KidsForm({ onApply }: { onApply: (need: KidsNeed) => void }) {
  const [need, setNeed] = useState<KidsNeed>({
    who: 'Girl',
    age: KIDS_AGES[0],
    occasion: '',
    budget: '',
  });
  const set = (k: keyof KidsNeed) => (e: { target: { value: string } }) =>
    setNeed((n) => ({ ...n, [k]: e.target.value }));

  return (
    <form
      className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-lavender-50 border border-lavender-100 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(need);
      }}
    >
      <select aria-label="Who is it for?" className={select} value={need.who} onChange={set('who')}>
        {KIDS_WHO.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>
      <select aria-label="Age" className={select} value={need.age} onChange={set('age')}>
        {KIDS_AGES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select
        aria-label="Kids occasion"
        className={select}
        value={need.occasion}
        onChange={set('occasion')}
      >
        <option value="">Any occasion</option>
        {OCCASIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select
        aria-label="Kids budget"
        className={select}
        value={need.budget}
        onChange={set('budget')}
      >
        <option value="">Any budget</option>
        {BUDGETS.map((b) => (
          <option key={b} value={b}>
            Up to {formatPriceRange(b, null).replace('/-', '')}
          </option>
        ))}
      </select>
      <p className="col-span-2 text-xs text-heliotrope-500 px-1">
        We use gender and age to pick outfits, plus occasion and budget. Kids&apos; sizes vary by
        store, so ask the store about size.
      </p>
      <button type="submit" className={`${BTN_PRIMARY} col-span-2`}>
        Show outfits
      </button>
    </form>
  );
}
