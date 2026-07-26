'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, AlertCircle, HardDrive, Info, ExternalLink } from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Alert = {
  id: string
  type: string
  message: string
  severity: string
  time: string
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch alerts on mount and every 60s
  useEffect(() => {
    const fetchAlerts = async () => {
      const key = sessionStorage.getItem('admin_key')
      if (!key) return
      try {
        const res = await fetch(`${API_URL}/v1/admin/alerts`, {
          headers: { 'x-admin-key': key },
        })
        if (res.ok) {
          const json = (await res.json()) as { data: Alert[] }
          const items = json.data ?? []
          setAlerts(items)
          const warnCount = items.filter((a) => a.severity === 'warning' || a.severity === 'critical').length
          setUnreadCount(warnCount)
        }
      } catch {
        // Silently ignore
      }
    }

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const severityIcon = (s: string) => {
    switch (s) {
      case 'critical': return <HardDrive size={14} className="text-red-500" />
      case 'warning': return <AlertCircle size={14} className="text-amber-500" />
      default: return <Info size={14} className="text-blue-400" />
    }
  }

  const severityBg = (s: string) => {
    switch (s) {
      case 'critical': return 'bg-red-50 border-red-200'
      case 'warning': return 'bg-amber-50 border-amber-200'
      default: return 'bg-blue-50 border-blue-200'
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"
          />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white/95 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-2xl overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-800">Notifications</span>
              </div>
              {unreadCount > 0 && (
                <span className="text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  {unreadCount} unread
                </span>
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
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${severityBg(alert.severity)}`}
                  >
                    {severityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-relaxed">{alert.message}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(alert.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <Link
              href="/admin/settings/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-center text-xs font-medium text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50/50 border-t border-gray-100 transition-all"
            >
              <span className="flex items-center justify-center gap-1">
                Notification Settings
                <ExternalLink size={12} />
              </span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default NotificationBell
