'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Now = { rss_mb: number; heap_used_mb: number; native_other_mb: number };

/**
 * Admin home card: live API process memory. Hidden when the request fails —
 * the route is Super Admin only, so a standard ADMIN simply never sees it.
 */
export function ServerMemoryCard() {
  const [now, setNow] = useState<Now | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/v1/admin/server-memory`, adminGetOptions())
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.data?.now) setNow(j.data.now);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!now) return null;
  const rows = [
    ['RSS (billed)', now.rss_mb],
    ['JS heap used', now.heap_used_mb],
    ['Native / other', now.native_other_mb],
  ] as const;

  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-6 lg:flex-1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">API server memory</h2>
        <Link
          href="/admin/server-memory"
          className="flex items-center gap-1 rounded text-xs text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-600"
        >
          Details <ArrowRight size={12} strokeWidth={1.5} />
        </Link>
      </div>
      <dl className="grid grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="mt-1 text-lg font-medium tabular-nums text-gray-900">{value} MB</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
