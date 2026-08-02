'use client'

import { useState, useEffect, Suspense, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Menu, Shield } from 'lucide-react'
import { PageLoader } from '@/components/PageLoader'
import { RouteProgress } from '@/components/RouteProgress'
import { FloatingOrbs } from './components/FloatingOrbs'
import { NotificationBell } from './components/NotificationBell'
import { Sidebar } from './components/Sidebar'

// ── Lazy-loaded admin components ──────────────────────────────────
// LoginScreen is the only genuinely lazy shell piece (it only renders
// pre-auth, so its mount cost is irrelevant to navigation). The sidebar /
// top-bar chrome (Sidebar, NotificationBell, FloatingOrbs) is imported
// statically on purpose: `next/dynamic({ ssr: false })` re-resolves the
// dynamic boundary on every App Router navigation, which REMOUNTS the
// sidebar/header on each route change — visible as the whole shell
// reloading instead of just the content area (user issue #1). All three are
// 'use client' and SSR-safe (no window/document access at render time), so
// static imports keep them mounted across navigations; only the keyed
// motion.main below swaps.

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

// Force dynamic rendering — framer-motion client components can't be statically prerendered
export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key')
    if (!saved) {
      setCheckingSession(false)
      return
    }
    fetch(`${API_URL}/v1/admin/stats`, {
      headers: { 'x-admin-key': saved },
    })
      .then((r) => {
        if (r.ok) setAuthed(true)
        else sessionStorage.removeItem('admin_key')
      })
      .catch(() => sessionStorage.removeItem('admin_key'))
      .finally(() => setCheckingSession(false))
  }, [])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [pathname])

  const handleLogin = (token: string) => {
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
            <span className="text-xs text-gray-400 hidden sm:inline">Admin</span>
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
              <Shield size={15} className="text-white" />
            </div>
          </div>
        </header>

        {/* Page content — keyed remount on route change, entrance animation
            only. AnimatePresence mode="wait" + Suspense + App Router streaming
            got stuck after navigation (the exit had to finish before the new
            page's RSC payload could mount), leaving a blank content area until
            a hard refresh. Removing the exit gate means the new page mounts
            immediately and only the content area swaps — sidebar/top bar stay
            mounted. */}
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="p-4 sm:p-6 lg:p-8 relative z-10"
        >
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
        </motion.main>
      </motion.div>
    </div>
  )
}
