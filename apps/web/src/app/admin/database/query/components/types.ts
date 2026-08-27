export type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  truncated: boolean
  execution_time_ms: number
  error?: string
}

export type HistoryEntry = {
  query: string
  timestamp: string
  execution_time_ms?: number
  row_count?: number
  error?: string
}

export type SavedQuery = {
  id: string
  name: string
  query: string
  created_at: string
  updated_at: string
}

export type SchemaColumn = {
  column_name: string
  data_type: string | null
  is_nullable: boolean
  column_default: string | null
  is_primary_key: boolean
  character_maximum_length: number | null
  numeric_precision: number | null
}

export type SchemaTable = {
  table_name: string
  columns: SchemaColumn[]
  column_count: number
}

export type SchemaInfo = {
  schema_name: string
  tables: SchemaTable[]
  table_count: number
}

export type SchemaResponse = {
  data: {
    schemas: SchemaInfo[]
    summary: {
      total_schemas: number
      total_tables: number
      total_columns: number
    }
  }
}

