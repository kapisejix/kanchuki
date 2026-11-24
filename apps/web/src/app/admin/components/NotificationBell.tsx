'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, ExternalLink, HardDrive, Info } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Alert = {
  id: string;
  type: string;
  message: string;
  severity: string;
  time: string;
};

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch alerts on mount and every 60s
  useEffect(() => {
    const fetchAlerts = async () => {
      const key = sessionStorage.getItem('admin_key');
      if (!key) return;
      try {
        const res = await fetch(`${API_URL}/v1/admin/alerts`, adminGetOptions());
        if (res.ok) {
          const json = (await res.json()) as { data: Alert[] };
          const items = json.data ?? [];
          setAlerts(items);
          const warnCount = items.filter(
            (a) => a.severity === 'warning' || a.severity === 'critical',
          ).length;
          setUnreadCount(warnCount);
        }
      } catch {
        // Silently ignore
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const severityIcon = (s: string) => {
    switch (s) {
      case 'critical':
        return <HardDrive size={14} className="text-red-500" />;
      case 'warning':
        return <AlertCircle size={14} className="text-amber-500" />;
      default:
        return <Info size={14} className="text-blue-400" />;
    }
  };

  const severityBg = (s: string) => {
    switch (s) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-32px)] sm:w-96 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Notifications</span>
              </div>
              {unreadCount > 0 && (
                <span className="text-xs text-red-700">{unreadCount} unread</span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <Bell size={28} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-xs text-gray-400">No recent notifications</p>
                </div>
              ) : (
                alerts.slice(0, 10).map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${severityBg(alert.severity)}`}
                  >
                    {severityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-relaxed">
                        {alert.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(alert.time).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Link
              href="/admin/settings/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-center text-xs font-medium text-ink-600 hover:text-ink-500 hover:bg-gray-50 border-t border-gray-100 transition-colors"
            >
              <span className="flex items-center justify-center gap-1">
                Notification settings
                <ExternalLink size={12} />
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;
