// Royal Orchid building blocks for the passport pages (same look as the retailer
// mobile app): lavender page, white rounded-3xl cards, spaceCadet text,
// heliotrope secondary, fuchsia accent. One copy here so /my-profile,
// /my-stores and /my-style cannot drift apart.

'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/50';

export const CARD =
  'bg-white rounded-3xl border border-lavender-200 shadow-sm shadow-spaceCadet-900/5';
export const BTN_PRIMARY = `min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-spaceCadet-900 to-tyrian-800 text-white text-sm font-semibold shadow-lg shadow-spaceCadet-900/25 transition-opacity hover:opacity-95 disabled:opacity-50 disabled:shadow-none ${FOCUS} focus-visible:ring-offset-2`;
export const BTN_SECONDARY = `min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-white border border-lavender-200 text-spaceCadet-900 text-sm font-semibold shadow-sm hover:bg-lavender-50 transition-colors disabled:opacity-50 ${FOCUS}`;
/** Quiet text action in the accent colour, still a 44px target. */
export const BTN_TEXT = `min-h-11 px-2 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-fuchsia-600 hover:bg-fuchsia-500/10 transition-colors disabled:opacity-50 ${FOCUS}`;
export const INPUT =
  'w-full min-h-11 px-3.5 rounded-xl border border-lavender-200 bg-white text-base sm:text-sm text-spaceCadet-900 placeholder:text-heliotrope-400 focus:outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30';
/** A native <select> dressed as a pill; the chevron is the browser's own. */
export const SELECT =
  'min-h-11 pl-3.5 pr-8 rounded-full border border-lavender-200 bg-white text-sm font-semibold text-spaceCadet-900 hover:border-heliotrope-400 transition-colors focus:outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30';
export const ROW_BTN = `w-full min-h-12 px-4 flex items-center gap-3 text-left rounded-2xl bg-lavender-50 border border-lavender-100 hover:bg-lavender-100 text-sm font-semibold text-spaceCadet-900 transition-colors disabled:opacity-50 ${FOCUS}`;
export const SKELETON = 'bg-lavender-100 animate-pulse motion-reduce:animate-none';

/** Toggle pill: dark when on, outlined when off (pair with aria-pressed). */
export function chip(on: boolean) {
  return `min-h-11 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold border whitespace-nowrap transition-colors ${FOCUS} ${
    on
      ? 'bg-spaceCadet-900 border-spaceCadet-900 text-white'
      : 'bg-white border-lavender-200 text-spaceCadet-900 hover:border-heliotrope-400'
  }`;
}

/** Segmented-control segment, same look as the shell's top nav. */
export function segment(on: boolean) {
  return `min-h-10 px-3 shrink-0 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${FOCUS} ${
    on
      ? 'bg-white text-spaceCadet-900 shadow-sm shadow-spaceCadet-900/10'
      : 'text-heliotrope-500 hover:text-spaceCadet-900'
  }`;
}
export const SEGMENTED = 'flex gap-1 p-1 rounded-2xl bg-lavender-100';

export const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
export const ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <motion.section variants={ITEM} className={`${CARD} p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <IconTile icon={Icon} />
        <div className="min-w-0 pt-1.5">
          <h2 className="text-base font-bold text-spaceCadet-900">{title}</h2>
          {description && <p className="text-sm text-heliotrope-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

export function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="h-9 w-9 shrink-0 rounded-xl bg-lavender-100 flex items-center justify-center">
      <Icon aria-hidden className="h-[18px] w-[18px] text-heliotrope-600" />
    </span>
  );
}

/** Empty / error / signed-out panel: icon, one line, optional action. */
export function Notice({
  icon: Icon,
  children,
  action,
}: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${CARD} px-6 py-10 text-center`}>
      <span className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-lavender-100 flex items-center justify-center">
        <Icon aria-hidden className="h-6 w-6 text-heliotrope-500" />
      </span>
      <div className="text-sm text-heliotrope-500 max-w-xs mx-auto">{children}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
