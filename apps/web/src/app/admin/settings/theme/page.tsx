'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PhonePreview from './PhonePreview';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// The six admin-configurable brand tokens — key names match the API
// (apps/api/src/routes/admin-settings.ts) and packages/shared/src/theme.ts.
const PALETTE_FIELDS: {
  key:
    | 'primary_color'
    | 'accent_color'
    | 'tertiary_color'
    | 'background_color'
    | 'text_color'
    | 'surface_color';
  label: string;
  description: string;
  default: string;
}[] = [
  {
    key: 'primary_color',
    label: 'Primary',
    description: 'Buttons, active nav, brand accent — the deep-navy anchor',
    default: '#14213D',
  },
  {
    key: 'accent_color',
    label: 'Accent',
    description: 'Hero accent & CTAs — the regal gold',
    default: '#FCA311',
  },
  {
    key: 'tertiary_color',
    label: 'Tertiary',
    description: 'Badges, checkmarks, star fill — antique bronze',
    default: '#8A5A12',
  },
  {
    key: 'background_color',
    label: 'Background',
    description: 'Page background — luminous white',
    default: '#FFFFFF',
  },
  {
    key: 'text_color',
    label: 'Text',
    description: 'Body text — bold black',
    default: '#000000',
  },
  {
    key: 'surface_color',
    label: 'Surface',
    description: 'Cards & fills — light grey',
    default: '#F5F5F5',
  },
];

type PaletteState = Record<(typeof PALETTE_FIELDS)[number]['key'], string>;

const DEFAULT_PALETTE: PaletteState = Object.fromEntries(
  PALETTE_FIELDS.map((f) => [f.key, f.default]),
) as PaletteState;

// Curated starting points (not a constraint — every token is editable below).
// Values are drawn from the documented ramp scales in packages/shared/src/colors.ts.
const PRESETS: { name: string; palette: PaletteState }[] = [
  {
    name: 'Black & Gold',
    palette: {
      primary_color: '#14213D',
      accent_color: '#FCA311',
      tertiary_color: '#8A5A12',
      background_color: '#FFFFFF',
      text_color: '#000000',
      surface_color: '#F5F5F5',
    },
  },
  {
    name: 'Midnight Bronze',
    palette: {
      primary_color: '#0B1322',
      accent_color: '#D6860A',
      tertiary_color: '#6E4710',
      background_color: '#FCFCFC',
      text_color: '#060A15',
      surface_color: '#F5F5F5',
    },
  },
  {
    name: 'Slate & Gold',
    palette: {
      primary_color: '#2C3F60',
      accent_color: '#FCA311',
      tertiary_color: '#A66528',
      background_color: '#FFFFFF',
      text_color: '#1A1A1A',
      surface_color: '#EEF1F6',
    },
  },
];

export default function ThemeSettingsPage() {
  const [savedPalette, setSavedPalette] = useState<PaletteState | null>(null);
  const [palette, setPalette] = useState<PaletteState>(DEFAULT_PALETTE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/theme`, adminGetOptions());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const saved = {
        ...DEFAULT_PALETTE,
        ...(json.data ?? {}),
      } as PaletteState;
      setSavedPalette(saved);
      setPalette(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load theme');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setToken = (key: keyof PaletteState, value: string) =>
    setPalette((prev) => ({ ...prev, [key]: value.toUpperCase() }));

  const resetToken = (key: keyof PaletteState) =>
    setPalette((prev) => ({
      ...prev,
      [key]: PALETTE_FIELDS.find((f) => f.key === key)!.default,
    }));

  const isValid = PALETTE_FIELDS.every((f) => HEX_RE.test(palette[f.key]));
  const isDirty = savedPalette
    ? PALETTE_FIELDS.some((f) => palette[f.key].toUpperCase() !== savedPalette[f.key].toUpperCase())
    : false;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setSaveResult(null);
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/theme`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify(palette),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSavedPalette({
        ...DEFAULT_PALETTE,
        ...(json.data ?? {}),
      } as PaletteState);
      setSaveResult('Palette saved — repaints the retailer mobile app on its next launch/refresh');
      setTimeout(() => setSaveResult(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Palette size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theme</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Six brand tokens — repaints the retailer mobile app platform-wide
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={load}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
          >
            <RefreshCw size={16} />
          </motion.button>
          <motion.button
            onClick={handleSave}
            disabled={saving || !isValid || loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving...' : 'Save'}
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {saveResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={15} />
            <span>{saveResult}</span>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="bg-white/60 rounded-xl border border-gray-200/60 p-6 space-y-3">
          <div className="h-5 bg-gray-200/60 rounded w-1/3 animate-pulse" />
          <div className="h-3 bg-gray-200/60 rounded w-2/3 animate-pulse" />
          <div className="h-3 bg-gray-200/60 rounded w-1/2 animate-pulse" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {/* Live preview header */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-lg p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={15} className="text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700">
                    Live preview — edits apply instantly
                  </h2>
                </div>
                {isDirty && (
                  <span className="text-[10px] font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                The phone shows the retailer app home screen — pick colors on the left and watch it
                repaint in real time. Save to push the palette to every installed app.
              </p>
            </div>

            {/* Token editors */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-lg p-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                {PALETTE_FIELDS.map((f) => {
                  const valid = HEX_RE.test(palette[f.key]);
                  return (
                    <div
                      key={f.key}
                      className="flex items-center gap-4 rounded-xl border border-gray-100 p-4 hover:border-cyan-200 transition-colors"
                    >
                      <input
                        type="color"
                        value={valid ? palette[f.key] : '#000000'}
                        onChange={(e) => setToken(f.key, e.target.value)}
                        className="w-11 h-11 rounded-lg border border-gray-200 cursor-pointer shrink-0"
                        aria-label={`${f.label} color picker`}
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`hex-${f.key}`}
                          className="text-xs font-semibold text-gray-700 block"
                        >
                          {f.label}
                          <span className="font-normal text-gray-400 ml-1.5 hidden sm:inline">
                            {f.description}
                          </span>
                        </label>
                        <div className="flex items-center gap-2 mt-1.5">
                          <input
                            id={`hex-${f.key}`}
                            type="text"
                            value={palette[f.key]}
                            onChange={(e) => setToken(f.key, e.target.value)}
                            placeholder="#1E2A3D"
                            spellCheck={false}
                            className={`px-2.5 py-1.5 rounded-lg border text-sm font-mono w-28 ${
                              valid ? 'border-gray-200' : 'border-red-300 text-red-600'
                            }`}
                          />
                          <button
                            onClick={() => resetToken(f.key)}
                            title={`Reset to default (${f.default})`}
                            className="p-1.5 text-gray-300 hover:text-cyan-600 transition-colors"
                          >
                            <RotateCcw size={14} />
                          </button>
                          {!valid && <span className="text-[10px] text-red-500">Invalid hex</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Presets */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Starting points
                </p>
                <div className="flex flex-wrap gap-3">
                  {PRESETS.map((p) => {
                    const active = PALETTE_FIELDS.every(
                      (f) => palette[f.key].toUpperCase() === p.palette[f.key].toUpperCase(),
                    );
                    return (
                      <button
                        key={p.name}
                        onClick={() => setPalette(p.palette)}
                        className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border transition-all ${
                          active
                            ? 'border-cyan-400 bg-cyan-50/60 ring-1 ring-cyan-400/30'
                            : 'border-gray-200 hover:border-cyan-300'
                        }`}
                        title={`Apply ${p.name}`}
                      >
                        <span className="flex -space-x-1">
                          {PALETTE_FIELDS.slice(0, 4).map((f) => (
                            <span
                              key={f.key}
                              className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: p.palette[f.key] }}
                            />
                          ))}
                        </span>
                        <span className="text-xs font-medium text-gray-600">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {savedPalette && (
              <p className="text-xs text-gray-400">
                Currently live:{' '}
                <span className="font-mono">
                  {PALETTE_FIELDS.map((f) => savedPalette[f.key]).join(' · ')}
                </span>
              </p>
            )}
          </div>

          {/* Sticky phone preview */}
          <div className="lg:sticky lg:top-6 h-fit">
            <PhonePreview palette={palette} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-gray-50/80 border border-gray-200 rounded-xl px-4 py-3">
        <Smartphone size={14} className="text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500">
          Every token repaints the retailer mobile app — buttons, icons, headers, badges, card
          fills, and page background — on its next launch or network refresh. No app-store release
          needed. The admin panel and customer website keep their own styling (the website follows
          the primary color only).
        </p>
      </div>
    </motion.div>
  );
}
