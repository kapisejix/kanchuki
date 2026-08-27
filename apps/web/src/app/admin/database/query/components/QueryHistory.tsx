import React from 'react'
import { History, Play, Trash2, X, Clock, AlertCircle } from 'lucide-react'
import type { HistoryEntry } from './types'

interface QueryHistoryProps {
  visible: boolean
  onClose: () => void
  history: HistoryEntry[]
  onSelectQuery: (sql: string) => void
  onClearHistory: () => void
}

export function QueryHistory({
  visible,
  onClose,
  history,
  onSelectQuery,
  onClearHistory,
}: QueryHistoryProps) {
  if (!visible) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white/95 backdrop-blur-2xl border-l border-gray-200 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-gray-900">Query History</h3>
          <span className="text-xs text-gray-500 font-mono">({history.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              title="Clear History"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <History size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No query history recorded yet.</p>
          </div>
        ) : (
          history.map((entry, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-gray-200 bg-gray-50/60 hover:bg-gray-100/80 transition-colors group relative"
            >
              <div className="flex items-center justify-between mb-1.5 text-[10px] text-gray-500 font-mono">
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <div className="flex items-center gap-2">
                  {entry.execution_time_ms != null && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {entry.execution_time_ms}ms
                    </span>
                  )}
                  {entry.row_count != null && <span>{entry.row_count} rows</span>}
                </div>
              </div>

              <pre className="text-xs font-mono text-gray-800 line-clamp-3 whitespace-pre-wrap bg-white p-2 rounded-lg border border-gray-200/80 mb-2">
                {entry.query}
              </pre>

              {entry.error && (
                <div className="text-[10px] text-red-600 flex items-center gap-1 mb-2">
                  <AlertCircle size={10} />
                  <span className="truncate">{entry.error}</span>
                </div>
              )}

              <button
                onClick={() => {
                  onSelectQuery(entry.query)
                  onClose()
                }}
                className="w-full py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
              >
                <Play size={10} />
                <span>Load in Editor</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

