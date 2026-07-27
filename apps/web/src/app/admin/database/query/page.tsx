'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import {
  Play,
  Download,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Terminal,
  Database,
  Trash2,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Table2,
  History,
  X,
  Bookmark,
  BookmarkCheck,
  Edit3,
  Plus,
  Layers,
  KeyRound,
  RefreshCw,
} from 'lucide-react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Dynamic Monaco Editor (SSR disabled) ──────────────────────

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-48 bg-gray-900/50 rounded-xl border border-gray-700/50 flex items-center justify-center">
      <Loader2 size={20} className="text-gray-500 animate-spin" />
    </div>
  ),
})

// ─── Types ─────────────────────────────────────────────────────

type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  truncated: boolean
  execution_time_ms: number
  error?: string
}

type HistoryEntry = {
  query: string
  timestamp: string
  execution_time_ms?: number
  row_count?: number
  error?: string
}

type SavedQuery = {
  id: string
  name: string
  query: string
  created_at: string
  updated_at: string
}

type SchemaColumn = {
  column_name: string
  data_type: string | null
  is_nullable: boolean
  column_default: string | null
  is_primary_key: boolean
  character_maximum_length: number | null
  numeric_precision: number | null
}

type SchemaTable = {
  table_name: string
  columns: SchemaColumn[]
  column_count: number
}

type SchemaInfo = {
  schema_name: string
  tables: SchemaTable[]
  table_count: number
}

type SchemaResponse = {
  data: {
    schemas: SchemaInfo[]
    summary: {
      total_schemas: number
      total_tables: number
      total_columns: number
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function getAdminHeaders() {
  const key = sessionStorage.getItem('admin_key')
  return { 'x-admin-key': key ?? '', 'Content-Type': 'application/json' }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
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

// ─── SAMPLE QUERIES ────────────────────────────────────────────

const SAMPLE_QUERIES = [
  { label: 'Retailers this month', query: "SELECT id, shop_name, city, plan, plan_status, created_at FROM retailers WHERE created_at >= date_trunc('month', CURRENT_DATE) ORDER BY created_at DESC LIMIT 20;" },
  { label: 'Active subscriptions', query: "SELECT r.shop_name, r.city, r.plan, s.amount_inr, s.billing_period, s.status FROM subscriptions s JOIN retailers r ON r.id = s.retailer_id WHERE s.status = 'ACTIVE' ORDER BY s.created_at DESC LIMIT 20;" },
  { label: 'Product categories', query: "SELECT category, COUNT(*) AS count FROM products WHERE deleted_at IS NULL GROUP BY category ORDER BY count DESC;" },
  { label: 'Top retailers by products', query: "SELECT r.shop_name, r.city, r.plan, COUNT(p.id) AS product_count FROM retailers r JOIN products p ON p.retailer_id = r.id AND p.deleted_at IS NULL WHERE r.deleted_at IS NULL GROUP BY r.id, r.shop_name, r.city, r.plan ORDER BY product_count DESC LIMIT 10;" },
  { label: 'Try-on usage stats', query: "SELECT retailer_id, COUNT(*) AS tries, SUM(cost_usd) AS total_cost_usd FROM try_on_usage_log WHERE created_at >= date_trunc('month', CURRENT_DATE) GROUP BY retailer_id ORDER BY total_cost_usd DESC LIMIT 10;" },
  { label: 'Schema: tables', query: "SELECT table_name, table_schema, (SELECT pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)))) AS size FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_name;" },
]

// ─── Container Variants ────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  },
}

// ─── Type Badge Component ──────────────────────────────────────
/** Display a compact SQL data type badge with optional length/precision. */
function TypeBadge({ type, maxLen }: { type: string | null; maxLen: number | null }) {
  if (!type) return <span className="text-gray-300">—</span>

  let display = type
  if (maxLen && ['varchar', 'character varying', 'char'].includes(type)) {
    display = `${type}(${maxLen})`
  }

  const colors: Record<string, string> = {
    integer: 'text-blue-600 bg-blue-50 border-blue-200',
    bigint: 'text-blue-600 bg-blue-50 border-blue-200',
    smallint: 'text-blue-600 bg-blue-50 border-blue-200',
    'character varying': 'text-emerald-600 bg-emerald-50 border-emerald-200',
    varchar: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    text: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    boolean: 'text-purple-600 bg-purple-50 border-purple-200',
    timestamp: 'text-amber-600 bg-amber-50 border-amber-200',
    'timestamp without time zone': 'text-amber-600 bg-amber-50 border-amber-200',
    'timestamp with time zone': 'text-amber-600 bg-amber-50 border-amber-200',
    date: 'text-amber-600 bg-amber-50 border-amber-200',
    numeric: 'text-rose-600 bg-rose-50 border-rose-200',
    'double precision': 'text-rose-600 bg-rose-50 border-rose-200',
    real: 'text-rose-600 bg-rose-50 border-rose-200',
    uuid: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    jsonb: 'text-violet-600 bg-violet-50 border-violet-200',
    json: 'text-violet-600 bg-violet-50 border-violet-200',
  }

  const colorClass = colors[type] ?? 'text-gray-500 bg-gray-50 border-gray-200'

  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${colorClass}`}>
      {display}
    </span>
  )
}

// ─── Excel-style Row Number ───────────────────────────────────

function RowNumberCell({ index }: { index: number }) {
  return (
    <div className="sticky left-0 z-10 bg-gray-50/80 backdrop-blur-sm px-3 py-2 text-[11px] text-gray-400 font-mono text-right select-none border-r border-gray-200/80 w-12 shrink-0">
      {index + 1}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────

export default function DatabaseQueryPage() {
  // Editor state
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

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Saved queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveQueryName, setSaveQueryName] = useState('')
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null)
  const [editingSavedName, setEditingSavedName] = useState('')

  // Schema explorer state
  const [schema, setSchema] = useState<SchemaInfo[] | null>(null)
  const [schemaSummary, setSchemaSummary] = useState<{ total_tables: number; total_columns: number } | null>(null)
  const [showSchema, setShowSchema] = useState(false)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  // Results UI state
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const resultRef = useRef<HTMLDivElement>(null)
  const runQueryRef = useRef<() => void>(() => {})

  // ── Load query history from the audit log on mount ───────────
  // B-013: history used to live only in sessionStorage (gone on next
  // device/session). Every query already writes a QUERY/QUERY_ERROR
  // AuditLog row (resource_type: 'DatabaseQuery') — reuse the existing
  // GET /admin/audit-logs endpoint instead of building a dedicated one.
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
            metadata: { query_preview?: string; row_count?: number; execution_time_ms?: number; error?: string } | null
          }>
        }
        setHistory(
          json.data.map((row) => ({
            query: row.metadata?.query_preview ?? '',
            timestamp: row.created_at,
            execution_time_ms: row.metadata?.execution_time_ms,
            row_count: row.metadata?.row_count,
            error: row.action === 'QUERY_ERROR' ? (row.metadata?.error ?? 'Query failed') : undefined,
          })),
        )
      } catch { /* fall back to whatever local history is already in state */ }
    })()
    // Load saved queries from localStorage
    try {
      const saved = localStorage.getItem('admin_saved_queries')
      if (saved) setSavedQueries(JSON.parse(saved) as SavedQuery[])
    } catch { /* ignore */ }
  }, [])

  // ── Fetch schema (lazy load on first click; force ignores cache) ─
  const fetchSchema = useCallback(async (force = false) => {
    if (schema !== null && !force) return // Already loaded
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
      // Auto-expand the first schema
      if (json.data.schemas.length > 0) {
        setExpandedSchemas(new Set([json.data.schemas[0].schema_name]))
      }
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : 'Failed to load schema')
    } finally {
      setSchemaLoading(false)
    }
  }, [schema])

  // ── Optimistic local prepend — the backend persists the same entry
  // to AuditLog on every query, so no local storage write is needed here.
  const saveHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 50))
  }, [])

  // ── Validate SQL (client-side) ───────────────────────────────
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

  // ── Execute query ────────────────────────────────────────────
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

      // Scroll to results after a brief delay for rendering
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

  // ── Keep ref in sync (for Monaco keybinding closure) ───────
  // Must be declared AFTER handleRun to avoid TDZ errors
  useEffect(() => {
    runQueryRef.current = handleRun
  })

  // ── Toggle row expansion ─────────────────────────────────────
  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  // ── Load a sample query ──────────────────────────────────────
  const loadSample = (query: string) => {
    setSql(query)
    setResult(null)
    setError('')
    validateSql(query)
  }

  // ── Saved queries helpers ────────────────────────────────────
  const persistSavedQueries = useCallback((queries: SavedQuery[]) => {
    try {
      localStorage.setItem('admin_saved_queries', JSON.stringify(queries))
    } catch { /* ignore quota */ }
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

  const handleRenameSaved = (id: string) => {
    if (!editingSavedName.trim()) {
      setEditingSavedId(null)
      return
    }
    const updated = savedQueries.map((q) =>
      q.id === id ? { ...q, name: editingSavedName.trim(), updated_at: new Date().toISOString() } : q,
    )
    setSavedQueries(updated)
    persistSavedQueries(updated)
    setEditingSavedId(null)
    setEditingSavedName('')
  }

  const handleLoadSaved = (saved: SavedQuery) => {
    setSql(saved.query)
    setShowSaved(false)
    setResult(null)
    setError('')
    validateSql(saved.query)
  }

  // ── Load a history entry ─────────────────────────────────────
  const loadHistoryEntry = (entry: HistoryEntry) => {
    setSql(entry.query)
    setShowHistory(false)
    setResult(null)
    setError('')
    validateSql(entry.query)
  }

  // ── Copy result as JSON ──────────────────────────────────────
  const copyResultAsJson = () => {
    if (!result) return
    const json = JSON.stringify(result.rows, null, 2)
    copyToClipboard(json)
    setCopiedId('json')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Copy result as Markdown table ────────────────────────────
  const copyResultAsMarkdown = () => {
    if (!result) return
    const header = `| ${result.columns.join(' | ')} |`
    const separator = `| ${result.columns.map(() => '---').join(' | ')} |`
    const rows = result.rows
      .slice(0, 50)
      .map((row) => {
        const vals = result.columns.map((col) => {
          const v = row[col]
          if (v === null || v === undefined) return ''
          return String(v).replace(/\|/g, '\\|')
        })
        return `| ${vals.join(' | ')} |`
      })
      .join('\n')
    const md = `${header}\n${separator}\n${rows}`
    copyToClipboard(md)
    setCopiedId('md')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Page Header ────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Database size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Database Query Console</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                SECURITY §14 — Read-only queries against the replica database
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => {
                setShowSchema(!showSchema)
                if (!schema && !schemaLoading) fetchSchema()
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                showSchema
                  ? 'bg-cyan-50 border-cyan-200 text-cyan-600'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Layers size={13} />
              Schema
              {schemaSummary && (
                <span className="text-[10px] text-gray-400 font-normal">({schemaSummary.total_tables})</span>
              )}
            </motion.button>
            <motion.button
              onClick={() => setShowSaved(!showSaved)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                showSaved
                  ? 'bg-amber-50 border-amber-200 text-amber-600'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Bookmark size={13} />
              Saved ({savedQueries.length})
            </motion.button>
            <motion.button
              onClick={() => setShowHistory(!showHistory)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                showHistory
                  ? 'bg-purple-50 border-purple-200 text-purple-600'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <History size={13} />
              History
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Sample Queries ─────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1 shrink-0">
            Samples:
          </span>
          {SAMPLE_QUERIES.map((sample, i) => (
            <motion.button
              key={i}
              onClick={() => loadSample(sample.query)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="text-[11px] font-medium px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50/50 transition-all whitespace-nowrap"
            >
              {sample.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── SQL Editor ─────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden shadow-xl"
      >
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/80 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-400">SQL Query</span>
            {!isValid && validationMsg && (
              <span className="text-[10px] text-amber-400 ml-2">{validationMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 hidden sm:block">
              {sql.trim() ? `${sql.trim().split(/\s+/).length} words` : ''}
            </span>
            <motion.button
              onClick={() => loadSample(SAMPLE_QUERIES[0].query)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-all"
            >
              <RotateCcw size={11} />
              Reset
            </motion.button>
          </div>
        </div>

        {/* Monaco editor */}
        <div className="h-64 sm:h-80" onKeyDown={(e) => e.stopPropagation()}>
          <MonacoEditor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={sql}
            onChange={(value) => {
              setSql(value ?? '')
              validateSql(value)
            }}
            onMount={(monacoEditor, monaco) => {
              // Register Ctrl+Enter / Cmd+Enter keybinding
              monacoEditor.addAction({
                id: 'run-query',
                label: 'Run Query',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => runQueryRef.current(),
              })
              monacoEditor.focus()
            }}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              padding: { top: 12 },
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              bracketPairColorization: { enabled: true },
              tabSize: 2,
              suggestOnTriggerCharacters: true,
              wordWrap: 'on',
            }}
          />
        </div>

        {/* Editor footer — Run button */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900/60 border-t border-gray-800">
          <div className="flex items-center gap-2">
            {sql.trim() && (
              <motion.button
                onClick={() => {
                  setSaveQueryName('')
                  setShowSaveDialog(true)
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium text-amber-400 hover:text-amber-300 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-all"
              >
                <Bookmark size={11} />
                Save
              </motion.button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-500">
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono text-[10px]">
                Ctrl
              </kbd>
              {' + '}
              <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 font-mono text-[10px]">
                Enter
              </kbd>
              {' to run'}
            </span>
            <span>Read-only replica</span>
            <span>Max 1,000 rows</span>
          </div>
          <motion.button
            onClick={handleRun}
            disabled={loading || !isValid || !sql.trim()}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-400 hover:to-violet-500 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            {loading ? 'Running...' : 'Run Query'}
          </motion.button>
        </div>
      </motion.div>

      {/* ── Saved Queries Panel (slide-down) ──────────────────── */}
      <AnimatePresence>
        {showSaved && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookmarkCheck size={14} className="text-amber-500" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Saved Queries
                  </span>
                  <span className="text-[10px] text-gray-400 font-normal normal-case">
                    ({savedQueries.length} saved)
                  </span>
                </div>
                <motion.button
                  onClick={() => {
                    setSavedQueries([])
                    localStorage.removeItem('admin_saved_queries')
                  }}
                  disabled={savedQueries.length === 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30"
                >
                  <Trash2 size={11} />
                  Clear all
                </motion.button>
              </div>
              {savedQueries.length === 0 ? (
                <div className="text-center py-6">
                  <Bookmark size={28} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs text-gray-400">
                    No saved queries yet — write a query, click <strong>Save</strong>, and give it a name
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedQueries.map((saved) => (
                    <div
                      key={saved.id}
                      className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100/80 transition-colors"
                    >
                      {editingSavedId === saved.id ? (
                        <>
                          <input
                            type="text"
                            value={editingSavedName}
                            onChange={(e) => setEditingSavedName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSaved(saved.id)
                              if (e.key === 'Escape') setEditingSavedId(null)
                            }}
                            autoFocus
                            className="flex-1 text-[11px] px-2 py-1 bg-white border border-amber-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 font-mono"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <motion.button
                            onClick={(e) => { e.stopPropagation(); handleRenameSaved(saved.id) }}
                            whileHover={{ scale: 1.1 }}
                            className="p-1 text-green-500 hover:text-green-600"
                          >
                            <Check size={12} />
                          </motion.button>
                        </>
                      ) : (
                        <>
                          <BookmarkCheck size={12} className="text-amber-400 shrink-0" />
                          <button
                            onClick={() => handleLoadSaved(saved)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="text-[12px] font-medium text-gray-700 truncate">
                              {saved.name}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono truncate mt-0.5">
                              {saved.query.replace(/\s+/g, ' ').slice(0, 80)}
                            </div>
                          </button>
                          <span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">
                            {new Date(saved.updated_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <motion.button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingSavedId(saved.id)
                                setEditingSavedName(saved.name)
                              }}
                              whileHover={{ scale: 1.1 }}
                              className="p-1 text-gray-400 hover:text-amber-500"
                            >
                              <Edit3 size={11} />
                            </motion.button>
                            <motion.button
                              onClick={(e) => { e.stopPropagation(); handleDeleteSaved(saved.id) }}
                              whileHover={{ scale: 1.1 }}
                              className="p-1 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 size={11} />
                            </motion.button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Save Query Dialog ──────────────────────────────────── */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSaveDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <BookmarkCheck size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Save Query</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Give your query a memorable name
                  </p>
                </div>
              </div>
              <input
                type="text"
                value={saveQueryName}
                onChange={(e) => setSaveQueryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveQuery()
                  if (e.key === 'Escape') setShowSaveDialog(false)
                }}
                placeholder="e.g., Monthly active retailers"
                autoFocus
                maxLength={100}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <motion.button
                  onClick={() => setShowSaveDialog(false)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handleSaveQuery}
                  disabled={!saveQueryName.trim() || !sql.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  <Plus size={13} />
                  Save Query
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Schema Explorer Panel (slide-down) ────────────────── */}
      <AnimatePresence>
        {showSchema && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-cyan-500" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Database Schema
                  </span>
                  {schemaSummary && (
                    <span className="text-[10px] text-gray-400 font-normal normal-case">
                      {schemaSummary.total_tables} tables · {schemaSummary.total_columns} columns
                    </span>
                  )}
                </div>
                <motion.button
                  onClick={() => {
                    if (!schemaLoading) fetchSchema(true)
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-500 transition-colors"
                >
                  <RefreshCw size={11} className={schemaLoading ? 'animate-spin' : ''} />
                  Refresh
                </motion.button>
              </div>

              {/* Loading state */}
              {schemaLoading && (
                <div className="space-y-2 py-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              )}

              {/* Error state */}
              {schemaError && !schemaLoading && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-500 text-xs rounded-lg px-3 py-2">
                  <AlertCircle size={12} />
                  <span>{schemaError}</span>
                </div>
              )}

              {/* Schema tree */}
              {!schemaLoading && !schemaError && schema && schema.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No tables found in the database</p>
              )}

              {!schemaLoading && schema && schema.length > 0 && (
                <div className="space-y-1">
                  {schema.map((sch) => {
                    const isSchemaExpanded = expandedSchemas.has(sch.schema_name)
                    return (
                      <div key={sch.schema_name} className="rounded-lg border border-gray-100/80 overflow-hidden">
                        {/* Schema header */}
                        <button
                          onClick={() => {
                            setExpandedSchemas((prev) => {
                              const next = new Set(prev)
                              if (next.has(sch.schema_name)) next.delete(sch.schema_name)
                              else next.add(sch.schema_name)
                              return next
                            })
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left"
                        >
                          <motion.div
                            animate={{ rotate: isSchemaExpanded ? 90 : 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <ChevronRight size={12} className="text-gray-400" />
                          </motion.div>
                          <Database size={13} className="text-cyan-500 shrink-0" />
                          <span className="text-[11px] font-semibold text-gray-700">{sch.schema_name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{sch.table_count} tables</span>
                        </button>

                        {/* Table list */}
                        {isSchemaExpanded && (
                          <div className="divide-y divide-gray-50">
                            {sch.tables.map((table) => {
                              const tableKey = `${sch.schema_name}.${table.table_name}`
                              const isTableExpanded = expandedTables.has(tableKey)
                              return (
                                <div key={tableKey}>
                                  {/* Table header (click to expand + click to insert) */}
                                  <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-gray-50/50 transition-colors group">
                                    <motion.div
                                      animate={{ rotate: isTableExpanded ? 90 : 0 }}
                                      transition={{ duration: 0.15 }}
                                    >
                                      <ChevronRight
                                        size={10}
                                        className="text-gray-300 cursor-pointer"
                                        onClick={() => {
                                          setExpandedTables((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(tableKey)) next.delete(tableKey)
                                            else next.add(tableKey)
                                            return next
                                          })
                                        }}
                                      />
                                    </motion.div>
                                    <button
                                      onClick={() => {
                                        const insertSql = `SELECT * FROM ${table.table_name} LIMIT 100;`
                                        setSql(insertSql)
                                        validateSql(insertSql)
                                        setShowSchema(false)
                                      }}
                                      className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
                                      title={`SELECT * FROM ${table.table_name}`}
                                    >
                                      <Table2 size={11} className="text-gray-400 shrink-0" />
                                      <span className="text-[11px] font-mono text-gray-600 truncate hover:text-cyan-600 transition-colors">
                                        {table.table_name}
                                      </span>
                                      <span className="text-[10px] text-gray-400 shrink-0">
                                        ({table.column_count})
                                      </span>
                                    </button>
                                  </div>

                                  {/* Column list */}
                                  {isTableExpanded && (
                                    <div className="pl-12 pr-3 py-1 space-y-0.5 bg-gray-50/30">
                                      {table.columns.map((col) => (
                                        <div key={col.column_name} className="flex items-center gap-2 py-0.5 group/col">
                                          <div className="w-1 h-1 rounded-full shrink-0">
                                            {col.is_primary_key ? (
                                              <KeyRound size={10} className="text-amber-400" />
                                            ) : (
                                              <div className="w-1 h-1 rounded-full bg-gray-300" />
                                            )}
                                          </div>
                                          <span className="text-[10px] font-mono text-gray-700 truncate flex-1 min-w-0">
                                            {col.column_name}
                                          </span>
                                          <span className="text-[9px] font-mono text-gray-400 shrink-0">
                                            <TypeBadge type={col.data_type} maxLen={col.character_maximum_length} />
                                          </span>
                                          {!col.is_nullable && (
                                            <span className="text-[8px] font-semibold text-red-400 uppercase shrink-0">NOT NULL</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer hint */}
              {!schemaLoading && schema && schema.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-3 text-center">
                  Click a table name to insert <code className="text-gray-500 font-mono">SELECT *</code> into editor
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── History Panel (slide-down) ──────────────────────────── */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Recent Queries
                  </span>
                </div>
                <motion.button
                  // Clears the local view only — the underlying AuditLog trail
                  // is immutable by design (see F-017 guardrails) and reloads on next visit.
                  onClick={() => setHistory([])}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={11} />
                  Clear
                </motion.button>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  No queries yet — run a query to see it here
                </p>
              ) : (
                <div className="space-y-1">
                  {history.map((entry, i) => (
                    <motion.button
                      key={i}
                      onClick={() => loadHistoryEntry(entry)}
                      whileHover={{ scale: 1.005 }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-gray-100/80 transition-colors group"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.error ? 'bg-red-400' : 'bg-green-400'}`} />
                      <code className="flex-1 text-[11px] text-gray-600 font-mono truncate">
                        {entry.query.replace(/\s+/g, ' ').slice(0, 120)}
                      </code>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0 min-w-[40px] text-right">
                        {entry.error ? (
                          <span className="text-red-400">Error</span>
                        ) : (
                          <>
                            {entry.row_count !== undefined ? `${entry.row_count} rows` : ''}
                            {entry.execution_time_ms !== undefined ? `, ${entry.execution_time_ms}ms` : ''}
                          </>
                        )}
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Errors ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {(result || loading) && (
          <motion.div
            ref={resultRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            variants={containerVariants}
            className="space-y-4"
          >
            {/* Results header */}
            <motion.div variants={itemVariants} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-md shadow-green-500/20">
                  <Table2 size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Results</h2>
                  {result && (
                    <p className="text-[10px] text-gray-500">
                      {result.row_count.toLocaleString('en-IN')} row{result.row_count !== 1 ? 's' : ''}
                      {result.truncated ? ' (truncated to 1,000)' : ''}
                      {' · '}
                      {result.execution_time_ms !== undefined ? formatDuration(result.execution_time_ms) : ''}
                      {' · '}
                      {result.columns.length} column{result.columns.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
              {result && !result.error && (
                <div className="flex items-center gap-1.5">
                  <motion.button
                    onClick={() => downloadCsv(result.columns, result.rows, `query-${Date.now()}.csv`)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                  >
                    <Download size={13} />
                    CSV
                  </motion.button>
                  <motion.button
                    onClick={copyResultAsJson}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                  >
                    {copiedId === 'json' ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    {copiedId === 'json' ? 'Copied!' : 'JSON'}
                  </motion.button>
                  <motion.button
                    onClick={copyResultAsMarkdown}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                  >
                    {copiedId === 'md' ? <Check size={13} className="text-green-500" /> : <FileText size={13} />}
                    {copiedId === 'md' ? 'Copied!' : 'Markdown'}
                  </motion.button>
                </div>
              )}
            </motion.div>

            {/* Loading skeleton */}
            {loading && (
              <motion.div variants={itemVariants} className="bg-white/80 rounded-2xl border border-gray-200/80 p-8 flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="animate-spin text-purple-500" />
                  <span className="text-sm text-gray-500">Executing query...</span>
                </div>
              </motion.div>
            )}

            {/* Results table */}
            {result && !result.error && result.columns.length > 0 && (
              <motion.div
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden shadow-lg"
              >
                {/* Column headers */}
                <div className="flex border-b border-gray-200/80 bg-gray-50/50 sticky top-0 z-20">
                  {/* Row number column header */}
                  <div className="sticky left-0 z-10 bg-gray-50/80 backdrop-blur-sm px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase border-r border-gray-200/80 w-12 shrink-0 text-right">
                    #
                  </div>
                  {result.columns.map((col) => (
                    <div
                      key={col}
                      className="px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider shrink-0 border-r border-gray-100/80 last:border-r-0"
                      style={{ minWidth: 140, maxWidth: 300 }}
                      title={col}
                    >
                      <span className="truncate block">{col}</span>
                    </div>
                  ))}
                </div>

                {/* Table body */}
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  {result.rows.map((row, rowIndex) => {
                    const isExpanded = expandedRows.has(rowIndex)
                    return (
                      <div key={rowIndex}>
                        {/* Row */}
                        <div
                          className={`flex border-b border-gray-100/60 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-gray-50/50' : ''
                          }`}
                          onClick={() => toggleRow(rowIndex)}
                        >
                          <RowNumberCell index={rowIndex} />
                          {result.columns.map((col) => {
                            const val = row[col]
                            const display = val === null ? 'NULL' : String(val)
                            return (
                              <div
                                key={col}
                                className="px-4 py-2 text-xs text-gray-700 font-mono truncate shrink-0 border-r border-gray-100/60 last:border-r-0"
                                style={{ minWidth: 140, maxWidth: 300 }}
                                title={display}
                              >
                                <span className={`truncate block ${val === null ? 'text-gray-400 italic' : ''}`}>
                                  {display}
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Expanded row JSON */}
                        {isExpanded && (
                          <div className="bg-gray-900/5 border-b border-gray-100/60 px-4 py-3">
                            <pre className="text-[11px] text-gray-600 font-mono overflow-x-auto whitespace-pre-wrap max-h-48">
                              {JSON.stringify(row, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Footer */}
                {result.row_count > result.rows.length && (
                  <div className="px-4 py-3 bg-amber-50/80 border-t border-amber-200/80 text-xs text-amber-600 text-center">
                    Showing {result.rows.length.toLocaleString('en-IN')} of {result.row_count.toLocaleString('en-IN')} rows.
                    {' '}Use more specific WHERE clauses or LIMIT to reduce results.
                  </div>
                )}
                {result.row_count <= result.rows.length && result.row_count > 0 && (
                  <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100/80 text-[10px] text-gray-400 text-center">
                    {result.row_count.toLocaleString('en-IN')} row{result.row_count !== 1 ? 's' : ''} returned
                  </div>
                )}
              </motion.div>
            )}

            {/* Empty result */}
            {result && !result.error && result.columns.length === 0 && (
              <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-8 text-center">
                <Database size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Query executed successfully — no results returned</p>
                <p className="text-xs text-gray-400 mt-1">
                  {result.execution_time_ms !== undefined ? `Completed in ${formatDuration(result.execution_time_ms)}` : ''}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Empty state ──────────────────────────────────────────── */}
      {!loading && !result && !error && (
        <motion.div variants={itemVariants} className="text-center py-16">
          <Database size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-sm text-gray-500">Write a SQL query above to get started</p>
          <p className="text-xs text-gray-400 mt-1">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500 font-mono text-[10px]">
              Ctrl
            </kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-500 font-mono text-[10px]">
              Enter
            </kbd>
            {' to run'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <span className="text-[10px] text-gray-400">Try a sample:</span>
            {SAMPLE_QUERIES.slice(0, 3).map((sample, i) => (
              <motion.button
                key={i}
                onClick={() => loadSample(sample.query)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="text-[11px] font-medium px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50/50 transition-all"
              >
                {sample.label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Security Notice ─────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="text-center">
        <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
          <AlertCircle size={10} />
          All queries are logged to the audit trail and run against the read-replica database
        </p>
      </motion.div>
    </motion.div>
  )
}
