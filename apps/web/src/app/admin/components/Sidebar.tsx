'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Gauge,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  Image as ImageIcon,
  KeyRound,
  UsersRound,
  Ticket,
  BarChart3,
  ShoppingCart,
  History,
  Terminal,
  HardDrive,
  Settings,
  Clock,
  GitBranch,
  Cpu,
  Activity,
  CheckSquare,
  ActivitySquare,
  Archive,
  Package,
  Palette,
  Bot,
  type LucideIcon,
} from 'lucide-react'

type Leaf = { label: string; href: string; icon: LucideIcon }
type Group = { label: string; icon: LucideIcon; children: Leaf[] }
type NavItem = Leaf | Group | { separator: true }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Retailers', href: '/admin/retailers', icon: Store },
  { label: 'Customers', href: '/admin/customers', icon: Users },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
  { separator: true },
  {
    label: 'Plans',
    icon: Gauge,
    children: [
      { label: 'Plan Limits', href: '/admin/plan-limits', icon: Gauge },
      { label: 'Plan Features', href: '/admin/plan-features', icon: CheckSquare },
    ],
  },
  {
    label: 'AI Models',
    icon: Bot,
    children: [
      { label: 'AI Providers', href: '/admin/ai-providers', icon: Bot },
      { label: 'AI Usage', href: '/admin/ai-usage', icon: BarChart3 },
    ],
  },
  {
    label: 'Catalog',
    icon: Package,
    children: [
      { label: 'Backgrounds', href: '/admin/background-images', icon: ImageIcon },
      { label: 'Integrations', href: '/admin/integrations', icon: KeyRound },
      { label: 'Catalog Upload Tiers', href: '/admin/catalog-upload-tiers', icon: Package },
      { label: 'Addon Purchases', href: '/admin/addon-purchases', icon: ShoppingCart },
    ],
  },
  {
    label: 'Team',
    icon: UsersRound,
    children: [
      { label: 'Team Members', href: '/admin/team-members', icon: UsersRound },
      { label: 'Support Tickets', href: '/admin/support-tickets', icon: Ticket },
    ],
  },
  { label: 'Reports', href: '/admin/reports', icon: BarChart3 },
  { separator: true },
  {
    label: 'Operations',
    icon: Shield,
    children: [
      { label: 'Overview', href: '/admin/operations', icon: Shield },
      { label: 'Pending Approvals', href: '/admin/operations/pending', icon: Clock },
      { label: 'Deployments', href: '/admin/operations/deployments', icon: GitBranch },
      { label: 'Deployment Gate', href: '/admin/operations/gate', icon: Activity },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { label: 'General', href: '/admin/settings', icon: Settings },
      { label: 'Rate Limits', href: '/admin/settings/rate-limits', icon: Gauge },
      { label: 'AI Config', href: '/admin/settings/ai-config', icon: Cpu },
      { label: 'Theme', href: '/admin/settings/theme', icon: Palette },
    ],
  },
  { separator: true },
  {
    label: 'Activity',
    icon: ActivitySquare,
    children: [
      { label: 'Activity Feed', href: '/admin/activity', icon: ActivitySquare },
      { label: 'Audit Log', href: '/admin/audit-log', icon: History },
    ],
  },
  {
    label: 'Database',
    icon: HardDrive,
    children: [
      { label: 'Query Console', href: '/admin/database/query', icon: Terminal },
      { label: 'Backup & Restore', href: '/admin/database/backup', icon: HardDrive },
      { label: 'Database Health', href: '/admin/database/status', icon: Activity },
      { label: 'Deletion Vault', href: '/admin/database/deletion-vault', icon: Archive },
    ],
  },
]

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [openGroup, setOpenGroup] = useState<{ label: string; top: number; left: number } | null>(null)

  const handleLogout = () => {
    sessionStorage.removeItem('admin_key')
    router.push('/admin')
  }

  const isLinkActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed top-0 left-0 z-50 h-full bg-gray-950/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } transition-transform duration-300`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-white/[0.06] shrink-0">
          <Link href="/admin" className="flex items-center gap-2.5 group px-3">
            <motion.div
              whileHover={{ scale: 1.05, rotate: -5 }}
              className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20"
            >
              <span className="text-white font-bold text-sm">K</span>
            </motion.div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-bold text-white text-sm truncate overflow-hidden whitespace-nowrap"
                >
                  Kanchuki Admin
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item, index) => {
            if ('separator' in item) {
              return (
                <div key={`sep-${index}`} className="my-2 border-t border-white/[0.06]" />
              )
            }

            if ('children' in item) {
              const isGroupActive = item.children.some((c) => isLinkActive(c.href))
              const isOpen = openGroup?.label === item.label

              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={(e) =>
                    setOpenGroup({ label: item.label, top: e.currentTarget.getBoundingClientRect().top, left: e.currentTarget.getBoundingClientRect().right })
                  }
                  onMouseLeave={() => setOpenGroup(null)}
                >
                  <button
                    type="button"
                    className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                      isGroupActive ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <item.icon
                      size={20}
                      className={`shrink-0 relative z-10 transition-colors ${
                        isGroupActive ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'
                      }`}
                    />
                    {!collapsed && (
                      <>
                        <span className="relative z-10 whitespace-nowrap flex-1 text-left">{item.label}</span>
                        <ChevronRight size={14} className="relative z-10 shrink-0 text-gray-600" />
                      </>
                    )}
                  </button>

                  {isOpen && openGroup && createPortal(
                    <div
                      style={{ position: 'fixed', top: openGroup.top, left: openGroup.left + 8 }}
                      className="w-56 bg-gray-900 border border-white/[0.08] rounded-xl shadow-2xl py-2 z-50"
                      onMouseEnter={() => setOpenGroup(openGroup)}
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      {item.children.map((child) => {
                          const childActive = isLinkActive(child.href)
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => {
                                onMobileClose()
                                setOpenGroup(null)
                              }}
                              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                                childActive ? 'text-cyan-400 bg-cyan-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                              }`}
                            >
                              <child.icon size={16} className="shrink-0" />
                              <span className="whitespace-nowrap">{child.label}</span>
                            </Link>
                          )
                        })}
                    </div>,
                    document.body
                  )}
                </div>
              )
            }

            const isActive = isLinkActive(item.href)

            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
              >
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group"
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent rounded-xl border border-cyan-500/10"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-cyan-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon
                    size={20}
                    className={`shrink-0 relative z-10 transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-gray-500 group-hover:text-gray-300'
                    }`}
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`relative z-10 whitespace-nowrap ${
                          isActive ? 'text-cyan-400' : 'text-gray-400 group-hover:text-gray-200'
                        }`}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </motion.div>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/[0.06] p-2 space-y-1">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center shrink-0">
              <Shield size={14} className="text-white" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-xs font-medium text-gray-300 truncate">Admin</p>
                  <p className="text-[10px] text-gray-500 truncate">Platform Manager</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.button
            onClick={handleLogout}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all group"
          >
            <LogOut size={20} className="shrink-0 group-hover:rotate-12 transition-transform" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="whitespace-nowrap"
                >
                  Sign out
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Collapse toggle */}
        <motion.button
          onClick={onToggle}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-gray-800 border border-white/[0.08] rounded-full items-center justify-center text-gray-400 hover:text-white hover:border-white/20 shadow-lg transition-all z-10"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <ChevronLeft size={14} />
          </motion.div>
        </motion.button>
      </motion.aside>
    </>
  )
}

export default Sidebar
