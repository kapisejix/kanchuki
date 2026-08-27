import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  Layers,
  Table2,
  KeyRound,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import type { SchemaInfo } from './types'

export function TypeBadge({ type, maxLen }: { type: string | null; maxLen: number | null }) {
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

interface SchemaBrowserProps {
  schema: SchemaInfo[] | null
  schemaSummary: { total_tables: number; total_columns: number } | null
  schemaLoading: boolean
  schemaError: string
  expandedSchemas: Set<string>
  expandedTables: Set<string>
  onToggleSchema: (name: string) => void
  onToggleTable: (name: string) => void
  onSelectTable: (tableName: string) => void
  onRefresh: () => void
}

export function SchemaBrowser({
  schema,
  schemaSummary,
  schemaLoading,
  schemaError,
  expandedSchemas,
  expandedTables,
  onToggleSchema,
  onToggleTable,
  onSelectTable,
  onRefresh,
}: SchemaBrowserProps) {
  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-violet-50 text-violet-600 border border-violet-100">
            <Database size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Schema Explorer</h3>
            {schemaSummary && (
              <p className="text-[11px] text-gray-500">
                {schemaSummary.total_tables} tables · {schemaSummary.total_columns} columns
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={schemaLoading}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Refresh Schema"
        >
          <RefreshCw size={14} className={schemaLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {schemaLoading && !schema && (
        <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Loader2 size={24} className="animate-spin text-violet-500" />
          <span className="text-xs">Loading database schema...</span>
        </div>
      )}

      {schemaError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{schemaError}</span>
        </div>
      )}

      {schema && (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {schema.map((sch) => {
            const isSchemaOpen = expandedSchemas.has(sch.schema_name)
            return (
              <div
                key={sch.schema_name}
                className="border border-gray-200/70 rounded-xl overflow-hidden bg-gray-50/40"
              >
                {/* Schema Header */}
                <button
                  onClick={() => onToggleSchema(sch.schema_name)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-gray-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-violet-500" />
                    <span className="text-xs font-semibold text-gray-800">{sch.schema_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                      {sch.table_count}
                    </span>
                  </div>
                  {isSchemaOpen ? (
                    <ChevronDown size={14} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-400" />
                  )}
                </button>

                {/* Tables List */}
                <AnimatePresence>
                  {isSchemaOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-t border-gray-200/70 divide-y divide-gray-200/40 bg-white"
                    >
                      {sch.tables.map((table) => {
                        const tableKey = `${sch.schema_name}.${table.table_name}`
                        const isTableOpen = expandedTables.has(tableKey)

                        return (
                          <div key={table.table_name}>
                            <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50/80 transition-colors group">
                              <button
                                onClick={() => onToggleTable(tableKey)}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                <Table2 size={13} className="text-gray-400 group-hover:text-gray-600" />
                                <span className="text-xs font-medium text-gray-700">
                                  {table.table_name}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  ({table.column_count})
                                </span>
                              </button>
                              <button
                                onClick={() => onSelectTable(table.table_name)}
                                className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-violet-50 hover:text-violet-600 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                SELECT
                              </button>
                            </div>

                            {/* Columns Detail */}
                            {isTableOpen && (
                              <div className="bg-gray-50/60 px-4 py-2 border-t border-gray-100 space-y-1.5">
                                {table.columns.map((col) => (
                                  <div
                                    key={col.column_name}
                                    className="flex items-center justify-between text-[11px]"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {col.is_primary_key && (
                                        <KeyRound size={10} className="text-amber-500" />
                                      )}
                                      <span
                                        className={`font-mono ${
                                          col.is_primary_key ? 'font-bold text-gray-900' : 'text-gray-700'
                                        }`}
                                      >
                                        {col.column_name}
                                      </span>
                                    </div>
                                    <TypeBadge
                                      type={col.data_type}
                                      maxLen={col.character_maximum_length}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

