'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  Play,
  Bookmark,
  History,
  Database,
  Loader2,
  AlertCircle,
  Terminal,
  X,
  Check,
  RotateCcw,
} from 'lucide-react'

import { SchemaBrowser } from './components/SchemaBrowser'
import { QueryResultsTable } from './components/QueryResultsTable'
import { QueryHistory } from './components/QueryHistory'
import { SavedQueries } from './components/SavedQueries'
import type {
  QueryResult,
  HistoryEntry,
  SavedQuery,
  SchemaInfo,
  SchemaResponse,
} from './components/types'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-48 bg-gray-900/50 rounded-xl border border-gray-700/50 flex items-center justify-center">
      <Loader2 size={20} className="text-gray-500 animate-spin" />
    </div>
  ),
})

function getAdminHeaders() {
  const key = typeof window !== 'undefined' ? sessionStorage.getItem('admin_key') : ''
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

function downloadCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
  const data = rows.map((row) =>
    columns
      .map((col) => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        return `"${String(val).replace(/"/g, '""')}"`
      })
      .join(','),
  )
  const csv = [header, ...data].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const SAMPLE_QUERIES = [
  {
    label: 'Retailers this month',
    query:
      "SELECT id, shop_name, city, plan, plan_status, created_at FROM retailers WHERE created_at >= date_trunc('month', CURRENT_DATE) ORDER BY created_at DESC LIMIT 20;",
  },
  {
    label: 'Active subscriptions',
    query:
      "SELECT r.shop_name, r.city, r.plan, s.amount_inr, s.billing_period, s.status FROM subscriptions s JOIN retailers r ON r.id = s.retailer_id WHERE s.status = 'ACTIVE' ORDER BY s.created_at DESC LIMIT 20;",
  },
  {
    label: 'Product categories',
    query:
      'SELECT category, COUNT(*) AS count FROM products WHERE deleted_at IS NULL GROUP BY category ORDER BY count DESC;',
  },
  {
    label: 'Top retailers by products',
    query:
      'SELECT r.shop_name, r.city, r.plan, COUNT(p.id) AS product_count FROM retailers r JOIN products p ON p.retailer_id = r.id AND p.deleted_at IS NULL WHERE r.deleted_at IS NULL GROUP BY r.id, r.shop_name, r.city, r.plan ORDER BY product_count DESC LIMIT 10;',
  },
]

export default function DatabaseQueryPage() {
  const [sql, setSql] = useState(`-- Write your SQL query here
SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_name
LIMIT 20;`)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isValid, setIsValid] = useState(true)
  const [validationMsg, setValidationMsg] = useState('')

  // Drawers
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveQueryName, setSaveQueryName] = useState('')

  // Schema state
  const [schema, setSchema] = useState<SchemaInfo[] | null>(null)
  const [schemaSummary, setSchemaSummary] = useState<{
    total_tables: number
    total_columns: number
  } | null>(null)
  const [showSchema, setShowSchema] = useState(false)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const resultRef = useRef<HTMLDivElement>(null)
  const runQueryRef = useRef<() => void>(() => {})

  // Load audit history and saved queries on mount
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/admin/audit-logs?resource_type=DatabaseQuery&limit=50`,
          { headers: getAdminHeaders() },
        )
        if (!res.ok) return
        const json = (await res.json()) as {
          data: Array<{
            action: string
            created_at: string
            metadata: {
              query_preview?: string
              row_count?: number
              execution_time_ms?: number
              error?: string
            } | null
          }>
        }
        setHistory(
          json.data.map((row) => ({
            query: row.metadata?.query_preview ?? '',
            timestamp: row.created_at,
            execution_time_ms: row.metadata?.execution_time_ms,
            row_count: row.metadata?.row_count,
            error:
              row.action === 'QUERY_ERROR'
                ? row.metadata?.error ?? 'Query failed'
                : undefined,
          })),
        )
      } catch {
        // Fallback
      }
    })()

    try {
      const saved = localStorage.getItem('admin_saved_queries')
      if (saved) setSavedQueries(JSON.parse(saved) as SavedQuery[])
    } catch {
      // Ignore
    }
  }, [])

  const fetchSchema = useCallback(
    async (force = false) => {
      if (schema !== null && !force) return
      setSchemaLoading(true)
      setSchemaError('')
      if (force) setSchema(null)
      try {
        const res = await fetch(`${API_URL}/v1/admin/schema`, {
          headers: getAdminHeaders(),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        const json = (await res.json()) as SchemaResponse
        setSchema(json.data.schemas)
        setSchemaSummary(json.data.summary)
        if (json.data.schemas.length > 0) {
          setExpandedSchemas(new Set([json.data.schemas[0].schema_name]))
        }
      } catch (err) {
        setSchemaError(err instanceof Error ? err.message : 'Failed to load schema')
      } finally {
        setSchemaLoading(false)
      }
    },
    [schema],
  )

  const saveHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 50))
  }, [])

  const validateSql = useCallback((value: string | undefined) => {
    const trimmed = (value ?? '').trim()
    if (!trimmed) {
      setIsValid(false)
      setValidationMsg('Query is empty')
      return
    }
    const stripped = trimmed.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*\s*/m, '').trim()
    const firstWord = stripped.split(/[\s(]/)[0]?.toUpperCase() ?? ''
    if (!['SELECT', 'EXPLAIN', 'WITH'].includes(firstWord)) {
      setIsValid(false)
      setValidationMsg(`Only SELECT, EXPLAIN, and WITH are allowed (got "${firstWord}")`)
      return
    }
    setIsValid(true)
    setValidationMsg('')
  }, [])

  const handleRun = async () => {
    const trimmed = sql.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch(`${API_URL}/v1/admin/query`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ query: trimmed }),
      })
      const json = await res.json()

      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP ${res.status}: ${res.statusText}`
        setError(msg)
        saveHistory({ query: trimmed, timestamp: new Date().toISOString(), error: msg })
        return
      }

      setResult(json.data)
      saveHistory({
        query: trimmed,
        timestamp: new Date().toISOString(),
        execution_time_ms: json.data.execution_time_ms,
        row_count: json.data.row_count,
      })

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Query failed'
      setError(msg)
      saveHistory({ query: trimmed, timestamp: new Date().toISOString(), error: msg })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runQueryRef.current = handleRun
  })

  const loadSample = (query: string) => {
    setSql(query)
    setResult(null)
    setError('')
    validateSql(query)
  }

  const persistSavedQueries = useCallback((queries: SavedQuery[]) => {
    try {
      localStorage.setItem('admin_saved_queries', JSON.stringify(queries))
    } catch {
      // Ignore
    }
  }, [])

  const handleSaveQuery = () => {
    if (!saveQueryName.trim() || !sql.trim()) return
    const newSaved: SavedQuery = {
      id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: saveQueryName.trim(),
      query: sql.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const updated = [newSaved, ...savedQueries].slice(0, 100)
    setSavedQueries(updated)
    persistSavedQueries(updated)
    setShowSaveDialog(false)
    setSaveQueryName('')
  }

  const handleDeleteSaved = (id: string) => {
    const updated = savedQueries.filter((q) => q.id !== id)
    setSavedQueries(updated)
    persistSavedQueries(updated)
  }

  const handleRenameSaved = (id: string, newName: string) => {
    const updated = savedQueries.map((q) =>
      q.id === id ? { ...q, name: newName, updated_at: new Date().toISOString() } : q,
    )
    setSavedQueries(updated)
    persistSavedQueries(updated)
  }

  const handleDownloadCsv = () => {
    if (!result) return
    downloadCsv(result.columns, result.rows, `query_result_${Date.now()}.csv`)
  }

  const handleCopyJson = () => {
    if (!result) return
    navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-slate-900 text-gray-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Terminal size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Database Query Console</h1>
              <p className="text-xs text-gray-400">
                Execute safe read-only SQL queries against Kanchuki PostgreSQL
              </p>
            </div>
          </div>

          {/* Action Drawer Toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowSchema(!showSchema)
                if (!showSchema) void fetchSchema()
              }}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showSchema
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Database size={14} />
              <span>Schema</span>
            </button>

            <button
              onClick={() => setShowSaved(true)}
              className="px-3 py-2 rounded-xl border border-gray-700 bg-gray-800/80 text-xs font-semibold text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-1.5"
            >
              <Bookmark size={14} />
              <span>Saved ({savedQueries.length})</span>
            </button>

            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-2 rounded-xl border border-gray-700 bg-gray-800/80 text-xs font-semibold text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-1.5"
            >
              <History size={14} />
              <span>History ({history.length})</span>
            </button>
          </div>
        </div>

        {/* Sample Queries Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">
            Templates:
          </span>
          {SAMPLE_QUERIES.map((sample) => (
            <button
              key={sample.label}
              onClick={() => loadSample(sample.query)}
              className="px-3 py-1 rounded-full text-xs font-medium bg-gray-800/60 border border-gray-700/60 text-gray-300 hover:text-white hover:border-violet-500/60 transition-colors"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* Main Grid (Schema Browser + Query Editor) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Optional Schema Sidebar */}
          {showSchema && (
            <div className="lg:col-span-4">
              <SchemaBrowser
                schema={schema}
                schemaSummary={schemaSummary}
                schemaLoading={schemaLoading}
                schemaError={schemaError}
                expandedSchemas={expandedSchemas}
                expandedTables={expandedTables}
                onToggleSchema={(name) =>
                  setExpandedSchemas((prev) => {
                    const n = new Set(prev)
                    if (n.has(name)) n.delete(name)
                    else n.add(name)
                    return n
                  })
                }
                onToggleTable={(key) =>
                  setExpandedTables((prev) => {
                    const n = new Set(prev)
                    if (n.has(key)) n.delete(key)
                    else n.add(key)
                    return n
                  })
                }
                onSelectTable={(tableName) => {
                  loadSample(`SELECT * FROM ${tableName} LIMIT 20;`)
                }}
                onRefresh={() => void fetchSchema(true)}
              />
            </div>
          )}

          {/* Editor & Results Area */}
          <div className={showSchema ? 'lg:col-span-8 space-y-6' : 'lg:col-span-12 space-y-6'}>
            {/* Query Editor Box */}
            <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-700/60 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                  SQL Editor (Monaco)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="px-3 py-1.5 rounded-xl border border-gray-700 bg-gray-900/60 text-xs font-semibold text-gray-300 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <Bookmark size={13} />
                    <span>Save Query</span>
                  </button>
                  <button
                    onClick={handleRun}
                    disabled={loading || !isValid}
                    className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    <span>Run Query</span>
                  </button>
                </div>
              </div>

              {/* Monaco Code Editor */}
              <div className="rounded-xl overflow-hidden border border-gray-700">
                <MonacoEditor
                  height="220px"
                  language="sql"
                  theme="vs-dark"
                  value={sql}
                  onChange={(val) => {
                    setSql(val ?? '')
                    validateSql(val)
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, Menlo, monospace',
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 10, bottom: 10 },
                  }}
                />
              </div>

              {/* Validation error hint */}
              {!isValid && validationMsg && (
                <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={14} />
                  <span>{validationMsg}</span>
                </div>
              )}
            </div>

            {/* Results Section */}
            <div ref={resultRef}>
              <QueryResultsTable
                result={result}
                loading={loading}
                error={error}
                onDownloadCsv={handleDownloadCsv}
                onCopyJson={handleCopyJson}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Query Modal */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 max-w-md w-full space-y-4">
            <h3 className="text-sm font-bold text-white">Save Current Query</h3>
            <input
              type="text"
              placeholder="e.g. Active subscriptions this month"
              value={saveQueryName}
              onChange={(e) => setSaveQueryName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 rounded-xl border border-gray-700 text-xs font-semibold text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuery}
                disabled={!saveQueryName.trim()}
                className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Query History Drawer */}
      <QueryHistory
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        history={history}
        onSelectQuery={(q) => loadSample(q)}
        onClearHistory={() => setHistory([])}
      />

      {/* Saved Queries Drawer */}
      <SavedQueries
        visible={showSaved}
        onClose={() => setShowSaved(false)}
        savedQueries={savedQueries}
        onSelectQuery={(q) => loadSample(q)}
        onDeleteQuery={handleDeleteSaved}
        onRenameQuery={handleRenameSaved}
      />
    </div>
  )
}
