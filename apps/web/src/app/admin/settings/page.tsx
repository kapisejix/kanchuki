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
    color: 'from-cyan-500 to-cyan-600',
  },
  {
    title: 'AI Model Config',
    description: 'Select AI model, temperature, and timeout per operation type',
    href: '/admin/settings/ai-config',
    icon: Cpu,
    color: 'from-purple-500 to-purple-600',
  },
  {
    title: 'Notifications',
    description: 'Configure alert channels for backup failures and system events',
    href: '/admin/settings/notifications',
    icon: Bell,
    color: 'from-amber-500 to-amber-600',
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
          <motion.div key={s.href} variants={itemVariants} whileHover={{ y: -4, scale: 1.01 }}>
            <Link
              href={s.href}
              className={`group block bg-gradient-to-r ${s.color} rounded-2xl p-6 text-white hover:shadow-xl transition-all relative overflow-hidden`}
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="flex items-start justify-between mb-4 relative">
                <s.icon size={28} className="text-white/70" />
                <ArrowRight size={18} className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="font-semibold text-lg mb-1 relative">{s.title}</h3>
              <p className="text-sm text-white/70 relative">{s.description}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
