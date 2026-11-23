'use client'

import { motion } from 'framer-motion'
import { Gauge, Cpu, ArrowRight, Bell } from 'lucide-react'
import Link from 'next/link'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const SETTINGS = [
  {
    title: 'Rate Limits',
    description: 'Configure request rate limits per endpoint — adjust without redeploy',
    href: '/admin/settings/rate-limits',
    icon: Gauge,
  },
  {
    title: 'AI Model Config',
    description: 'Select AI model, temperature, and timeout per operation type',
    href: '/admin/settings/ai-config',
    icon: Cpu,
  },
  {
    title: 'Notifications',
    description: 'Configure alert channels for backup failures and system events',
    href: '/admin/settings/notifications',
    icon: Bell,
  },
]

export default function SettingsPage() {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Configure platform-wide settings and integrations</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {SETTINGS.map((s) => (
          <motion.div key={s.href} variants={itemVariants}>
            <Link
              href={s.href}
              className="group block rounded-xl border border-gray-200 bg-white p-6 transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-600"
            >
              <div className="flex items-start justify-between mb-4 relative">
                <s.icon size={18} strokeWidth={1.5} className="text-gray-500" />
                <ArrowRight size={16} strokeWidth={1.5} className="text-gray-400 transition-colors group-hover:text-gray-900" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">{s.title}</h3>
              <p className="text-xs text-gray-500">{s.description}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
