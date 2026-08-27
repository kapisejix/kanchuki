import React, { useState } from 'react'
import {
  Download,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Rows,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { QueryResult } from './types'

interface QueryResultsTableProps {
  result: QueryResult | null
  loading: boolean
  error: string
  onDownloadCsv: () => void
  onCopyJson: () => void
}

function formatCellValue(val: unknown): { display: string; isJson: boolean; isNull: boolean } {
  if (val === null || val === undefined) {
    return { display: 'NULL', isJson: false, isNull: true }
  }
  if (typeof val === 'boolean') {
    return { display: val ? 'TRUE' : 'FALSE', isJson: false, isNull: false }
  }
  if (typeof val === 'object') {
    return { display: JSON.stringify(val, null, 2), isJson: true, isNull: false }
  }
  return { display: String(val), isJson: false, isNull: false }
}

export function QueryResultsTable({
  result,
  loading,
  error,
  onDownloadCsv,
  onCopyJson,
}: QueryResultsTableProps) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null)
  const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({})

  const copyValue = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCell(id)
    setTimeout(() => setCopiedCell(null), 1500)
  }

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-12 text-center shadow-sm">
        <div className="inline-block p-4 rounded-2xl bg-violet-50 text-violet-600 mb-3 animate-pulse">
          <Clock size={28} className="animate-spin" />
        </div>
        <h4 className="text-sm font-semibold text-gray-800">Executing Query...</h4>
        <p className="text-xs text-gray-500 mt-1">Connecting to PostgreSQL and running statement</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-red-200 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 shrink-0">
            <AlertCircle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-red-900">Query Execution Error</h4>
            <p className="text-xs font-mono text-red-700 mt-1.5 whitespace-pre-wrap leading-relaxed bg-red-50/50 p-3 rounded-xl border border-red-100">
              {error}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-dashed border-gray-300 p-12 text-center shadow-sm">
        <Layers size={32} className="mx-auto text-gray-300 mb-3" />
        <h4 className="text-sm font-semibold text-gray-700">No Query Executed Yet</h4>
        <p className="text-xs text-gray-400 mt-1">
          Write an SQL query above and press &quot;Run Query&quot; (Ctrl+Enter)
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      {/* Table Header Bar */}
      <div className="px-5 py-3.5 border-b border-gray-200/80 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1.5 font-medium">
            <Rows size={14} className="text-gray-400" />
            <span>
              <strong className="text-gray-900">{result.row_count}</strong> rows
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <Clock size={14} className="text-gray-400" />
            <span>
              <strong className="text-gray-900">{result.execution_time_ms}ms</strong>
            </span>
          </div>
          {result.truncated && (
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
              TRUNCATED (MAX 500 ROWS)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCopyJson}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Copy size={13} />
            <span>Copy JSON</span>
          </button>
          <button
            onClick={onDownloadCsv}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="max-h-[550px] overflow-auto">
        <table className="w-full text-left text-xs border-collapse font-mono">
          <thead className="bg-gray-100/80 sticky top-0 z-10 border-b border-gray-200 text-gray-700">
            <tr>
              <th className="w-12 px-3 py-2 text-center text-gray-400 font-sans text-[10px] select-none border-r border-gray-200">
                #
              </th>
              {result.columns.map((col) => (
                <th key={col} className="px-3 py-2 font-semibold select-all border-r border-gray-200">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60 bg-white">
            {result.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-violet-50/30 transition-colors">
                <td className="w-12 px-3 py-2 text-center text-gray-400 font-sans text-[10px] select-none bg-gray-50/50 border-r border-gray-200">
                  {rowIdx + 1}
                </td>
                {result.columns.map((col) => {
                  const val = row[col]
                  const cellId = `${rowIdx}-${col}`
                  const { display, isJson, isNull } = formatCellValue(val)
                  const isExpanded = expandedJson[cellId]

                  return (
                    <td
                      key={col}
                      className={`px-3 py-2 max-w-xs truncate border-r border-gray-200/60 ${
                        isNull ? 'text-gray-400 italic' : 'text-gray-800'
                      }`}
                    >
                      {isJson ? (
                        <div>
                          <button
                            onClick={() =>
                              setExpandedJson((prev) => ({ ...prev, [cellId]: !prev[cellId] }))
                            }
                            className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-100 font-mono hover:bg-violet-100 flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            <span>JSON object</span>
                          </button>
                          {isExpanded && (
                            <pre className="mt-1 p-2 bg-gray-900 text-gray-100 rounded-lg text-[10px] overflow-x-auto whitespace-pre">
                              {display}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => copyValue(display, cellId)}
                          className="cursor-pointer group flex items-center justify-between gap-1"
                          title="Click to copy"
                        >
                          <span className="truncate">{display}</span>
                          <span className="opacity-0 group-hover:opacity-100 text-gray-400">
                            {copiedCell === cellId ? (
                              <Check size={11} className="text-emerald-500" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </span>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
