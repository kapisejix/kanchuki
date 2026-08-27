import React from 'react'
import { Bookmark, Play, Trash2, Edit3, X, Check } from 'lucide-react'
import type { SavedQuery } from './types'

interface SavedQueriesProps {
  visible: boolean
  onClose: () => void
  savedQueries: SavedQuery[]
  onSelectQuery: (sql: string) => void
  onDeleteQuery: (id: string) => void
  onRenameQuery: (id: string, newName: string) => void
}

export function SavedQueries({
  visible,
  onClose,
  savedQueries,
  onSelectQuery,
  onDeleteQuery,
  onRenameQuery,
}: SavedQueriesProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState('')

  if (!visible) return null

  const handleStartRename = (q: SavedQuery) => {
    setEditingId(q.id)
    setEditingName(q.name)
  }

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      onRenameQuery(id, editingName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white/95 backdrop-blur-2xl border-l border-gray-200 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark size={16} className="text-violet-600" />
          <h3 className="text-sm font-bold text-gray-900">Saved Queries</h3>
          <span className="text-xs text-gray-500 font-mono">({savedQueries.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {savedQueries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bookmark size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">No queries saved yet.</p>
            <p className="text-[11px] text-gray-400 mt-1">
              Click the bookmark icon above the query editor to save frequent queries.
            </p>
          </div>
        ) : (
          savedQueries.map((q) => (
            <div
              key={q.id}
              className="p-3 rounded-xl border border-gray-200 bg-gray-50/60 hover:bg-gray-100/80 transition-colors"
            >
              {editingId === q.id ? (
                <div className="flex items-center gap-1.5 mb-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 bg-white border border-violet-300 rounded-lg focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveRename(q.id)}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-900 truncate">{q.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartRename(q)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      title="Rename"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteQuery(q.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}

              <pre className="text-xs font-mono text-gray-800 line-clamp-3 whitespace-pre-wrap bg-white p-2 rounded-lg border border-gray-200/80 mb-2">
                {q.query}
              </pre>

              <button
                onClick={() => {
                  onSelectQuery(q.query)
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

