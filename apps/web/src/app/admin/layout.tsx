'use client'

import { useState, useEffect, Suspense, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Menu, Shield, ShieldAlert, ArrowLeft } from 'lucide-react'
import { PageLoader } from '@/components/PageLoader'
import { RouteProgress } from '@/components/RouteProgress'
import { FloatingOrbs } from './components/FloatingOrbs'
import { NotificationBell } from './components/NotificationBell'
import { Sidebar } from './components/Sidebar'

// ── Super Admin Restricted Route Prefixes ──────────────────────────
const SUPER_ADMIN_RESTRICTED_PREFIXES = [
  '/admin/integrations',
  '/admin/ai-providers',
  '/admin/ai-usage',
  '/admin/billing',
  '/admin/commission',
  '/admin/plan-limits',
  '/admin/plan-features',
  '/admin/resource-packs',
  '/admin/addon-purchases',
  '/admin/settings',
  '/admin/operations',
  '/admin/database',
  '/admin/audit-log',
  '/admin/storage-report',
]

// ── Lazy-loaded admin components ──────────────────────────────────
const LoginScreen = nextDynamic(() => import('./components/LoginScreen'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <PageLoader variant="fullscreen" text="Loading login..." />
    </div>
  ),
})

// ── API URL ──────────────────────────────────────────────────────

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ── Main Layout ──────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [adminRole, setAdminRole] = useState<string>('SUPER_ADMIN')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Check for existing session on mount.
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key')
    if (!saved) {
      setCheckingSession(false)
      return
    }
    fetch(`${API_URL}/v1/admin/session`, {
      headers: { 'x-admin-key': saved },
    })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.removeItem('admin_key')
          sessionStorage.removeItem('admin_role')
          setAuthed(false)
        } else {
          const json = (await r.json().catch(() => null)) as {
            data?: { authenticated?: boolean; role?: string }
          } | null
          const role = json?.data?.role ?? sessionStorage.getItem('admin_role') ?? 'SUPER_ADMIN'
          setAdminRole(role)
          sessionStorage.setItem('admin_role', role)

          // If role is a field staff / salesperson, redirect them to /survey
          if (role === 'MARKETING_AGENT' || role === 'SUPPORT_AGENT') {
            router.replace('/survey')
            return
          }
          setAuthed(true)
        }
      })
      .catch(() => {
        setAuthed(true)
      })
      .finally(() => setCheckingSession(false))
  }, [router])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [pathname])

  const handleLogin = (token: string, role?: string) => {
    const userRole = role ?? sessionStorage.getItem('admin_role') ?? 'SUPER_ADMIN'
    setAdminRole(userRole)
    if (userRole === 'MARKETING_AGENT' || userRole === 'SUPPORT_AGENT') {
      router.replace('/survey')
      return
    }
    setAuthed(true)
  }

  // Prevent flash of login screen — show loading skeleton while checking sessionStorage
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    )
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
    )
  }

  const isRestrictedForStandardAdmin =
    adminRole !== 'SUPER_ADMIN' &&
    SUPER_ADMIN_RESTRICTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )

  return (
    <div className="min-h-screen bg-gray-50">
      <RouteProgress />
      <FloatingOrbs />

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onLogout={() => setAuthed(false)}
        role={adminRole}
      />

      {/* Main content area */}
      <motion.div
        animate={{ marginLeft: sidebarCollapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative"
      >
        {/* Top header bar */}
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => setMobileSidebarOpen(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </motion.button>
            <div className="text-xs text-gray-400 font-mono">
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
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hidden sm:inline">
              {adminRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
            </span>
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
              <Shield size={15} className="text-white" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="p-4 sm:p-6 lg:p-8 relative z-10"
        >
          {isRestrictedForStandardAdmin ? (
            <div className="max-w-xl mx-auto mt-16 p-8 bg-white border border-red-100 rounded-3xl shadow-xl shadow-red-500/5 text-center">
              <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-500">
                <ShieldAlert size={28} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Access Restricted</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                This section is restricted to <span className="font-semibold text-gray-700">Super Admins</span>. Standard Admin accounts do not have access to API integrations, Payment, Billing, Settings, and Operations.
              </p>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-semibold shadow-md transition-all"
              >
                <ArrowLeft size={14} />
                Back to Dashboard
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
      </motion.div>
    </div>
  )
}
