'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { Activity, ArrowRight } from 'lucide-react';
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
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Activity size={16} className="text-gray-400" />
          API Server Memory
        </h2>
        <Link
          href="/admin/server-memory"
          className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
        >
          Details <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xl font-semibold text-gray-900">{now.rss_mb} MB</p>
          <p className="text-[11px] text-gray-500">RSS (billed)</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-gray-900">{now.heap_used_mb} MB</p>
          <p className="text-[11px] text-gray-500">JS heap used</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-gray-900">{now.native_other_mb} MB</p>
          <p className="text-[11px] text-gray-500">Native / other</p>
        </div>
      </div>
    </div>
  );
}
