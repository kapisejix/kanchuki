'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type PendingOperation = {
  id: string
  type: string
  description: string
  requested_by: string
  requested_at: string
  metadata: Record<string, unknown> | null
}

function getHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return {
    'x-admin-key': key ?? '',
    'Content-Type': 'application/json',
  }
}

export default function PendingApprovalsPage() {
  const [operations, setOperations] = useState<PendingOperation[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [rejectModal, setRejectModal] = useState<{ id: string; type: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const loadOperations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/operations/pending`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setOperations(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOperations() }, [loadOperations])

  const handleApprove = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`${API_URL}/v1/admin/operations/${id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Failed to approve')
      setOperations((prev) => prev.filter((op) => op.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return
    setActionLoading(rejectModal.id)
    try {
      const res = await fetch(`${API_URL}/v1/admin/operations/${rejectModal.id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      if (!res.ok) throw new Error('Failed to reject')
      setOperations((prev) => prev.filter((op) => op.id !== rejectModal.id))
      setRejectModal(null)
      setRejectReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Clock size={24} className="text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
          </div>
          <p className="text-sm text-gray-500">
            Review and approve/reject operations requiring your authorization
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={loadOperations}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 hover:text-gray-800 hover:border-gray-300 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading && operations.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : operations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No pending operations</h3>
          <p className="text-sm text-gray-500 mt-1">
            All operations have been reviewed. Check back later for new requests.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {operations.map((op) => (
            <motion.div
              key={op.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              layout
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-full uppercase tracking-wider border border-amber-200">
                      {op.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(op.requested_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1">{op.description}</p>
                  <p className="text-xs text-gray-400 mt-1">Requested by: {op.requested_by}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleApprove(op.id)}
                    disabled={actionLoading === op.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-600 text-sm font-medium rounded-xl border border-green-200 transition-all disabled:opacity-50"
                  >
                    {actionLoading === op.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Approve
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setRejectModal({ id: op.id, type: op.type })}
                    disabled={actionLoading === op.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-xl border border-red-200 transition-all disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Reject
                  </motion.button>
                </div>
              </div>

              {op.metadata && Object.keys(op.metadata).length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    View metadata
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-50 rounded-xl text-[10px] text-gray-600 overflow-x-auto max-h-40">
                    {JSON.stringify(op.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reject Operation</h3>
            <p className="text-sm text-gray-500 mb-4">
              Provide a reason for rejecting this {rejectModal.type.toLowerCase()} operation.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 min-h-[100px]"
              autoFocus
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => { setRejectModal(null); setRejectReason('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {actionLoading === rejectModal.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                Reject
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
