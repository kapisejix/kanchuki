'use client';

import { PageLoader } from '@/components/PageLoader';
import { RouteProgress } from '@/components/RouteProgress';
import { adminRoleCanReach } from '@kanchuki/shared';
import { motion } from 'framer-motion';
import { ArrowLeft, Menu, Shield, ShieldAlert } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { NotificationBell } from './components/NotificationBell';
import { Sidebar } from './components/Sidebar';

// Super Admin restricted surfaces are NOT listed here. This file used to keep a
// 14-entry local copy, which promptly drifted from the API's 8-entry copy and
// the Sidebar's own list — the same route was reachable through the API while
// the page said "Access Restricted" (RC-034). One shared list now backs all
// three surfaces; see packages/shared/src/constants/admin-access.ts.

// ── Lazy-loaded admin components ──────────────────────────────────
const LoginScreen = nextDynamic(() => import('./components/LoginScreen'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <PageLoader variant="fullscreen" text="Loading login..." />
    </div>
  ),
});

// ── API URL ──────────────────────────────────────────────────────

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

// ── Main Layout ──────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [adminRole, setAdminRole] = useState<string>('SUPER_ADMIN');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for existing session on mount.
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key');
    if (!saved) {
      setCheckingSession(false);
      return;
    }
    fetch(`${API_URL}/v1/admin/session`, {
      headers: { 'x-admin-key': saved },
    })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.removeItem('admin_key');
          sessionStorage.removeItem('admin_role');
          setAuthed(false);
        } else if (!r.ok) {
          // Fail closed (T2.4 F4): a 5xx is not proof of a valid session. Keep the key so a
          // reload retries; the login screen is shown meanwhile.
          setAuthed(false);
        } else {
          const json = (await r.json().catch(() => null)) as {
            data?: { authenticated?: boolean; role?: string };
          } | null;
          const role = json?.data?.role ?? sessionStorage.getItem('admin_role') ?? 'SUPER_ADMIN';
          setAdminRole(role);
          sessionStorage.setItem('admin_role', role);

          // If role is a field staff / salesperson, redirect them to /survey
          if (role === 'MARKETING_AGENT' || role === 'SUPPORT_AGENT') {
            router.replace('/survey');
            return;
          }
          setAuthed(true);
        }
      })
      .catch(() => {
        setAuthed(false);
      })
      .finally(() => setCheckingSession(false));
  }, [router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const handleLogin = (token: string, role?: string) => {
    const userRole = role ?? sessionStorage.getItem('admin_role') ?? 'SUPER_ADMIN';
    setAdminRole(userRole);
    if (userRole === 'MARKETING_AGENT' || userRole === 'SUPPORT_AGENT') {
      router.replace('/survey');
      return;
    }
    setAuthed(true);
  };

  // Prevent flash of login screen — show loading skeleton while checking sessionStorage
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Login screen (lazy-loaded)
  if (!authed) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <PageLoader variant="fullscreen" text="Preparing login..." />
          </div>
        }
      >
        <LoginScreen onLogin={handleLogin} />
      </Suspense>
    );
  }

  const isRestrictedForStandardAdmin = !adminRoleCanReach(adminRole, pathname);

  return (
    <div className="min-h-screen bg-gray-50">
      <RouteProgress />

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onLogout={() => setAuthed(false)}
        role={adminRole}
      />

      {/* Main content area */}
      {/* Margin only from lg up: below that the sidebar is an off-canvas drawer. */}
      <div className={`relative ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        {/* Top header bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Open sidebar"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
            <div className="text-xs text-gray-500 font-mono tabular-nums">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-xs text-gray-500 hidden sm:inline">
              {adminRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
            </span>
            <div className="w-8 h-8 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center">
              <Shield size={16} strokeWidth={1.5} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="p-4 sm:p-6 lg:p-8 relative z-10"
        >
          {isRestrictedForStandardAdmin ? (
            <div className="max-w-xl mx-auto mt-16 p-8 bg-white border border-gray-200 rounded-xl text-center">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-4 text-red-700">
                <ShieldAlert size={18} strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-medium text-gray-900 mb-2">Access restricted</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                This section is restricted to{' '}
                <span className="font-medium text-gray-700">Super Admins</span>. Standard Admin
                accounts do not have access to API integrations, Payment, Billing, Settings, and
                Operations.
              </p>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 px-4 py-2 bg-ink-600 hover:bg-ink-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ArrowLeft size={14} />
                Back to dashboard
              </Link>
            </div>
          ) : (
            <Suspense
              fallback={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center min-h-[40vh]"
                >
                  <PageLoader variant="card" text="Loading page..." />
                </motion.div>
              }
            >
              {children}
            </Suspense>
          )}
        </motion.main>
      </div>
    </div>
  );
}
