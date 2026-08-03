'use client';

import {
  Battery,
  Bell,
  Check,
  Eye,
  Grid3X3,
  Heart,
  Home,
  Package,
  Plus,
  Share2,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
} from 'lucide-react';
import type { CSSProperties } from 'react';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// Defensive color helpers — an invalid hex (mid-typing) falls back to a
// neutral grey so the preview never disappears while the admin types.
function hexToRgba(hex: string, alpha: number): string {
  if (!HEX_RE.test(hex)) return `rgba(115, 115, 115, ${alpha})`;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shade(hex: string, percent: number): string {
  if (!HEX_RE.test(hex)) return '#737373';
  const amt = Math.round((255 * percent) / 100);
  const num = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export type PaletteState = {
  primary_color: string;
  accent_color: string;
  tertiary_color: string;
  background_color: string;
  text_color: string;
  surface_color: string;
};

const PALETTE_ORDER: { key: keyof PaletteState; label: string }[] = [
  { key: 'primary_color', label: 'Primary' },
  { key: 'accent_color', label: 'Accent' },
  { key: 'tertiary_color', label: 'Tertiary' },
  { key: 'background_color', label: 'Background' },
  { key: 'text_color', label: 'Text' },
  { key: 'surface_color', label: 'Surface' },
];

export default function PhonePreview({ palette }: { palette: PaletteState }) {
  const {
    primary_color: primary,
    accent_color: accent,
    tertiary_color: tertiary,
    background_color: background,
    text_color: text,
    surface_color: surface,
  } = palette;

  const muted = hexToRgba(text, 0.55);
  const faint = hexToRgba(text, 0.35);
  const primaryTint = hexToRgba(primary, 0.12);
  const accentTint = hexToRgba(accent, 0.14);

  // Transition helper so token edits repaint smoothly, not as a hard cut.
  const paint: CSSProperties = {
    transition:
      'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, fill 0.3s ease',
  };

  // Decorative mock of the retailer app — not interactive. aria-hidden so
  // screen readers don't announce the mock button/tab bar as real controls.
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className="relative w-[270px] rounded-[2.6rem] bg-gray-900 p-[10px] shadow-2xl shadow-gray-900/30 ring-1 ring-gray-700/60">
        {/* Side buttons */}
        <div className="absolute -left-[2px] top-24 h-14 w-[3px] rounded-l bg-gray-700" />
        <div className="absolute -left-[2px] top-44 h-9 w-[3px] rounded-l bg-gray-700" />
        <div className="absolute -right-[2px] top-32 h-16 w-[3px] rounded-r bg-gray-700" />

        {/* Screen */}
        <div
          className="relative h-[560px] overflow-hidden rounded-[2rem]"
          style={{ backgroundColor: background, ...paint }}
        >
          {/* Dynamic island */}
          <div className="absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

          {/* Status bar */}
          <div
            className="flex items-center justify-between px-6 pt-2.5 pb-1"
            style={{ color: text, ...paint }}
          >
            <span className="text-[10px] font-semibold tracking-wide">9:41</span>
            <span className="flex items-center gap-1">
              <Wifi size={10} strokeWidth={2.5} />
              <Battery size={12} strokeWidth={2.5} />
            </span>
          </div>

          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ backgroundColor: primary, ...paint }}
          >
            <span className="text-sm font-bold tracking-tight text-white">Kanchuki</span>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: hexToRgba('#FFFFFF', 0.18) }}
            >
              <Bell size={13} className="text-white" />
            </div>
          </div>

          {/* Body */}
          <div className="px-3.5 pt-3 pb-2" style={{ ...paint }}>
            {/* Greeting */}
            <div className="mb-2.5">
              <p className="text-[11px] font-semibold" style={{ color: text, ...paint }}>
                Namaste, Priya 👋
              </p>
              <p className="text-[9px]" style={{ color: muted, ...paint }}>
                Shree Laxmi Fashion · Mumbai
              </p>
            </div>

            {/* Stats row */}
            <div className="mb-2.5 grid grid-cols-4 gap-1.5">
              {[
                { icon: Package, label: 'Products', value: '128' },
                { icon: Users, label: 'Customers', value: '46' },
                { icon: ShoppingBag, label: 'Orders', value: '12' },
                { icon: Eye, label: 'Views', value: '1.2k' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border px-2 py-2"
                  style={{
                    backgroundColor: surface,
                    borderColor: hexToRgba(text, 0.08),
                    ...paint,
                  }}
                >
                  <div
                    className="mb-1 flex h-5 w-5 items-center justify-center rounded-md"
                    style={{ backgroundColor: primaryTint, ...paint }}
                  >
                    <s.icon size={11} style={{ color: primary, ...paint }} />
                  </div>
                  <p
                    className="text-[11px] font-bold leading-none"
                    style={{ color: text, ...paint }}
                  >
                    {s.value}
                  </p>
                  <p
                    className="mt-0.5 text-[7.5px] leading-none"
                    style={{ color: muted, ...paint }}
                  >
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Primary CTA */}
            <div
              className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${shade(primary, -18)})`,
                boxShadow: `0 8px 18px ${hexToRgba(primary, 0.35)}`,
                ...paint,
              }}
            >
              <Plus size={13} className="text-white" strokeWidth={3} />
              <span className="text-[11px] font-bold text-white">Add Product</span>
            </div>

            {/* Share collection card */}
            <div
              className="mb-2.5 flex items-center gap-2.5 rounded-xl border p-2.5"
              style={{
                backgroundColor: surface,
                borderColor: hexToRgba(accent, 0.28),
                ...paint,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: accentTint, ...paint }}
              >
                <Share2 size={14} style={{ color: accent, ...paint }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold" style={{ color: text, ...paint }}>
                  New Arrivals &apos;26
                </p>
                <p className="text-[8px]" style={{ color: muted, ...paint }}>
                  Collection link ready on WhatsApp
                </p>
              </div>
              <span
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[7.5px] font-bold"
                style={{
                  backgroundColor: tertiary,
                  color: '#FFFFFF',
                  ...paint,
                }}
              >
                <Check size={8} strokeWidth={3.5} />
                LIVE
              </span>
            </div>

            {/* Quick actions */}
            <div className="mb-2.5 grid grid-cols-2 gap-1.5">
              {[
                { icon: Sparkles, label: 'AI Catalog', color: primary },
                { icon: Share2, label: 'WhatsApp', color: accent },
                { icon: Grid3X3, label: 'Categories', color: tertiary },
                { icon: TrendingUp, label: 'Analytics', color: primary },
              ].map((a) => (
                <div
                  key={a.label}
                  className="flex items-center gap-2 rounded-xl border px-2 py-2"
                  style={{
                    backgroundColor: surface,
                    borderColor: hexToRgba(text, 0.08),
                    ...paint,
                  }}
                >
                  <a.icon size={12} style={{ color: a.color, ...paint }} />
                  <span className="text-[9px] font-medium" style={{ color: text, ...paint }}>
                    {a.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Trending products */}
            <div className="flex items-center justify-between px-0.5 pb-1.5">
              <p
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: muted, ...paint }}
              >
                Trending
              </p>
              <span className="text-[8px] font-semibold" style={{ color: accent, ...paint }}>
                See all ›
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { emoji: '🪷', name: 'Silk Lehenga', price: '₹12,999' },
                { emoji: '👘', name: 'Kurta Set', price: '₹2,499' },
              ].map((p) => (
                <div
                  key={p.name}
                  className="overflow-hidden rounded-xl border"
                  style={{
                    backgroundColor: surface,
                    borderColor: hexToRgba(text, 0.08),
                    ...paint,
                  }}
                >
                  <div
                    className="flex h-14 items-center justify-center text-2xl"
                    style={{
                      background: `linear-gradient(160deg, ${hexToRgba(primary, 0.14)}, ${hexToRgba(accent, 0.1)})`,
                      ...paint,
                    }}
                  >
                    {p.emoji}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <p className="text-[8.5px] font-medium" style={{ color: text, ...paint }}>
                      {p.name}
                    </p>
                    <Heart size={9} style={{ color: accent, fill: accent, ...paint }} />
                  </div>
                  <p
                    className="px-2 pb-1.5 text-[8.5px] font-bold"
                    style={{ color: primary, ...paint }}
                  >
                    {p.price}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Tab bar */}
          <div
            className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-around border-t px-2 pb-3 pt-1.5"
            style={{
              backgroundColor: background,
              borderColor: hexToRgba(text, 0.1),
              ...paint,
            }}
          >
            {[
              { icon: Home, label: 'Home', active: true },
              { icon: Grid3X3, label: 'Catalog', active: false },
              { icon: ShoppingBag, label: 'Orders', active: false },
              { icon: Users, label: 'Customers', active: false },
              { icon: Heart, label: 'Saved', active: false },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-0.5">
                <t.icon size={15} style={{ color: t.active ? primary : faint, ...paint }} />
                <span
                  className="h-1 w-1 rounded-full"
                  style={{
                    backgroundColor: t.active ? primary : 'transparent',
                    ...paint,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Token dots */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {PALETTE_ORDER.map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-2.5 shadow-sm"
            title={t.label}
          >
            <span
              className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
              style={{
                backgroundColor: HEX_RE.test(palette[t.key]) ? palette[t.key] : '#999999',
              }}
            />
            <span className="text-[10px] font-medium text-gray-600">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
