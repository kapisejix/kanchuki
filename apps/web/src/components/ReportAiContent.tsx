'use client';

import { Flag } from 'lucide-react';
import { useState } from 'react';

// Google Play AI-Generated Content policy: wherever the customer web shows AI output there
// must be an in-app way to report it. One inline control, not a modal, so it is safe inside
// a Sheet (whose unmount cleanup calls history.back(), RC-065) and needs no focus trap.
// Text only: the AI output itself is never sent. Works signed out (AI Stylist has no
// sign-in); with a passport session the proxy forwards the cookie and the API links it.

export const AI_REPORT_FEATURES = [
  'My Style selfie analysis',
  'My Style find similar',
  'My Style complete the look',
  'AI Stylist',
  'Virtual try-on',
] as const;
export type AiReportFeature = (typeof AI_REPORT_FEATURES)[number];

type State = 'idle' | 'open' | 'sending' | 'sent';

export function ReportAiContent({
  feature,
  contentRef,
  className = '',
}: {
  feature: AiReportFeature;
  /** Store slug or product id, when the screen has one. */
  contentRef?: string;
  className?: string;
}) {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/passport/ai-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feature, content_ref: contentRef, description: text.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('sent');
    } catch {
      setError('Could not send your report. Please try again.');
      setState('open');
    }
  }

  if (state === 'sent') {
    return (
      <p role="status" className={`text-xs text-gray-500 text-center py-2 ${className}`}>
        Thanks. We will review this content.
      </p>
    );
  }

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setState('open')}
        className={`min-h-11 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 ${className}`}
      >
        <Flag aria-hidden className="h-3.5 w-3.5" />
        Report this AI content
      </button>
    );
  }

  const tooShort = text.trim().length < 10;
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-xs font-semibold text-gray-600" htmlFor={`ai-report-${feature}`}>
        What is wrong with this AI-generated content?
      </label>
      <textarea
        id={`ai-report-${feature}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={3}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        placeholder="Offensive, wrong, unsafe… (at least 10 characters)"
      />
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={tooShort || state === 'sending'}
          className="min-h-11 flex-1 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-40"
        >
          {state === 'sending' ? 'Sending…' : 'Send report'}
        </button>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="min-h-11 px-4 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
