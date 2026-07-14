'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Store,
  CreditCard,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Menu,
  X,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Retailers', href: '/admin/retailers', icon: Store },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Check for existing session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key')
    if (saved) {
      setKey(saved)
      // Verify the key is still valid
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
      fetch(`${apiUrl}/v1/admin/stats`, {
        headers: { 'x-admin-key': saved },
      })
        .then((r) => {
          if (r.ok) setAuthed(true)
          else sessionStorage.removeItem('admin_key')
        })
        .catch(() => sessionStorage.removeItem('admin_key'))
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    try {
      const res = await fetch(`${apiUrl}/v1/admin/stats`, {
        headers: { 'x-admin-key': key },
      })
      if (!res.ok) throw new Error('Invalid admin key')
      sessionStorage.setItem('admin_key', key)
      setAuthed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_key')
    setAuthed(false)
    setKey('')
    router.push('/admin')
  }

  // Login screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-8 sm:p-10 border border-white/10 w-full max-w-sm shadow-2xl"
        >
          {/* Decorative gradient */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center justify-center mb-6">
              <div className="w-12 h-12 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/25">
                <Shield size={24} className="text-white" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-white text-center mb-2">Admin Panel</h1>
            <p className="text-sm text-gray-400 text-center mb-8">
              Enter your admin key to continue
            </p>

            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Admin key"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all mb-3"
              autoFocus
            />

            {error && (
              <p className="text-red-400 text-sm mb-3 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 active:scale-[0.98]"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        } ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Sidebar header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          <Link href="/admin" className="flex items-center gap-2.5 group min-w-0">
            <div className="w-8 h-8 bg-cyan-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-cyan-700 transition-colors">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            {!sidebarCollapsed && (
              <span className="font-bold text-gray-900 text-sm truncate">Kanchuki Admin</span>
            )}
          </Link>

          {/* Mobile close */}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon size={20} className="shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-gray-100 p-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
            title={sidebarCollapsed ? 'Sign out' : undefined}
          >
            <LogOut size={20} className="shrink-0" />
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-all"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Main content area */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        {/* Top header bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
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
            <span className="text-xs text-gray-400 hidden sm:inline">Admin</span>
            <div className="w-7 h-7 bg-cyan-100 rounded-full flex items-center justify-center">
              <Shield size={14} className="text-cyan-600" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
