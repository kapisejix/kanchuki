'use client'

// Messages submitted through the public /contact form
// (POST /v1/public/contact → AuditLog, resource_type ContactSubmission).
// This page is the team's inbox view — parsed name/topic/message instead of
// raw audit JSON. Read-only by design (no DB table to mutate; replies happen
// on WhatsApp/email, off-platform).

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  MessageSquare,
  MapPin,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Inbox,
  Clock,
  Monitor,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// Same vocabulary as the public form (apps/web/src/app/contact/ContactForm.tsx)
// and the API's CONTACT_TOPICS (apps/api/src/routes/public/public-misc.ts).
const TOPICS = ['Getting started', 'Catalog help', 'Billing', 'Partnership', 'Something else'] as const

type ContactSubmission = {
  id: string
  name: string
  shop_city: string | null
  topic: string
  message: string
  ip_address: string | null
  created_at: string
}

const TOPIC_COLORS: Record<string, string> = {
  'Getting started': 'bg-blue-50 text-blue-600 border-blue-200',
  'Catalog help': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Billing: 'bg-amber-50 text-amber-600 border-amber-200',
  Partnership: 'bg-purple-50 text-purple-600 border-purple-200',
  'Something else': 'bg-gray-50 text-gray-500 border-gray-200',
}

function topicColor(topic: string): string {
  return TOPIC_COLORS[topic] ?? TOPIC_COLORS['Something else']
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || '?'
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } },
}

export default function ContactSubmissionsPage() {
  const [messages, setMessages] = useState<ContactSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [topic, setTopic] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [cursorStack, setCursorStack] = useState<string[]>([])

  const load = useCallback(
    async (cursorVal?: string, pushStack = false) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        params.set('limit', '25')
        if (topic) params.set('topic', topic)
        if (cursorVal) params.set('cursor', cursorVal)

        const res = await fetch(`${API_URL}/v1/admin/contact-submissions?${params}`, adminGetOptions())
        const json = await res.json()
        // Guard: a 500 from the API returns { error } with no .data — keep the
        // last good list instead of crashing on `json.data` / pagination.
        if (!res.ok || !Array.isArray(json?.data)) {
          setError(`Failed to load messages (${res.status})`)
          setHasMore(false)
          setCursor(null)
          return
        }
        setMessages(json.data)
        setHasMore(json.pagination?.has_more ?? false)
        setCursor(json.pagination?.cursor ?? null)
        setTotal(json.pagination?.total ?? 0)
        if (pushStack && cursorVal) setCursorStack((prev) => [...prev, cursorVal])
      } catch {
        setError('Network error — could not load messages')
        setHasMore(false)
        setCursor(null)
      } finally {
        setLoading(false)
      }
    },
    [topic],
  )

  useEffect(() => {
    load()
  }, [load])

  const handleTopicChange = (value: string) => {
    setTopic(value)
    setCursorStack([])
    setCursor(null)
    setHasMore(false)
  }

  const handleNext = () => {
    if (cursor) load(cursor, true)
  }

  const handlePrev = () => {
    const prev = cursorStack[cursorStack.length - 1]
    if (prev) {
      setCursorStack((stack) => stack.slice(0, -1))
      load(prev)
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
              <Mail size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Contact Submissions</h1>
              <p className="text-sm text-gray-500">
                Messages from the public contact form — newest first
              </p>
            </div>
          </div>
          <motion.button
            onClick={() => load(cursor ?? undefined)}
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* Topic filter */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Topic</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleTopicChange('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                topic === ''
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              All {total > 0 && `(${total})`}
            </button>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => handleTopicChange(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  topic === t
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
        >
          <span>{error}</span>
        </motion.div>
      )}

      {/* Loading skeleton */}
      {loading && messages.length === 0 && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/80 rounded-2xl border border-gray-200/80 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200/60 rounded-full animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-200/60 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-200/60 rounded w-1/4 animate-pulse" />
                </div>
              </div>
              <div className="h-12 bg-gray-100/80 rounded-xl animate-pulse" />
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && messages.length === 0 && !error && (
        <motion.div variants={itemVariants} className="text-center py-20 bg-white/80 rounded-2xl border border-gray-200/80">
          <Inbox size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">
            {topic ? `No "${topic}" messages yet` : 'No contact messages yet'}
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            Messages sent through the public contact form (kanchuki.app/contact) appear here as soon
            as someone submits one.
          </p>
        </motion.div>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <motion.div variants={containerVariants} className="space-y-3">
          <div className="px-1 text-xs text-gray-400">
            {total} message{total === 1 ? '' : 's'}
            {topic ? ` · topic: ${topic}` : ''}
          </div>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              variants={itemVariants}
              className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 overflow-hidden transition-all hover:shadow-sm"
            >
              <div className="p-5">
                {/* From row */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {initials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{m.name || 'Anonymous'}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${topicColor(m.topic)}`}>
                        {m.topic || 'Something else'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                      {m.shop_city && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {m.shop_city}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(m.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Message body */}
                <div className="mt-3 bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    <MessageSquare size={11} />
                    Message
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                    {m.message}
                  </p>
                </div>

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between text-[10px] text-gray-300">
                  <span className="font-mono truncate max-w-[60%]">#{m.id}</span>
                  {m.ip_address && (
                    <span className="flex items-center gap-1 font-mono shrink-0">
                      <Monitor size={10} />
                      {m.ip_address}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Pagination */}
      {(cursorStack.length > 0 || hasMore) && !loading && (
        <motion.div variants={itemVariants} className="flex items-center justify-center gap-3">
          <motion.button
            onClick={handlePrev}
            disabled={cursorStack.length === 0}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            Previous
          </motion.button>
          <span className="text-xs text-gray-400 font-mono">Page {cursorStack.length + 1}</span>
          <motion.button
            onClick={handleNext}
            disabled={!hasMore}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-40"
          >
            Next
            <ArrowRight size={14} />
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  )
}
