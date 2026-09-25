// ─── Source-scanning helper: markdown table cell-count guard ───────
//
// A markdown table row's cells are read positionally — one `|` off and every
// cell after it shifts, silently: a date lands in a status column, a Verdict
// column renders empty, and nothing errors because the row is still valid
// markdown, just the wrong shape. This defect showed up 18 times across
// CLAUDE.md/BUILD-LOG.md/PLAN.md (see docs/root-cause/README.md's "Checking
// the tracker table" section) before this guard existed — every instance was
// invisible until read by eye.
//
// This module is pure (no fs): it takes a file's already-read text and
// returns every row whose cell count disagrees with its table's header. The
// caller (the test) owns finding files and deciding what's allowlisted.

/** One row whose cell count doesn't match its table's header. */
export interface TableCellMismatch {
  file: string
  /** 1-indexed line number. */
  line: number
  expectedCells: number
  actualCells: number
  raw: string
}

const FENCE = /^\s*```/
// A cell delimiter is a `|` not escaped with `\` — `\|` inside a cell must
// not be counted, or an escaped pipe in prose is misread as a column boundary.
const UNESCAPED_PIPE = /(?<!\\)\|/g

function countCells(row: string): number {
  const pipes = row.match(UNESCAPED_PIPE)
  return pipes ? Math.max(pipes.length - 1, 0) : 0
}

function isTableRow(row: string): boolean {
  return row.trim().startsWith('|')
}

/** `| --- | :---: | --- |` — the row between header and data, never itself a data row. */
function isSeparatorRow(row: string): boolean {
  const trimmed = row.trim()
  return trimmed.startsWith('|') && trimmed.includes('-') && /^\|[\s:|-]*\|?$/.test(trimmed)
}

/**
 * Scan `content` for markdown tables and report every data row whose cell
 * count differs from its header's. A table is recognised the same way a
 * markdown renderer recognises one: a `|`-led line immediately followed by a
 * `|`-led separator row. Anything inside a fenced code block is skipped, so
 * a doc that shows example table syntax doesn't trip its own guard.
 */
export function findTableCellMismatches(file: string, content: string): TableCellMismatch[] {
  const lines = content.split(/\r?\n/)
  const violations: TableCellMismatch[] = []
  let inFence = false
  let headerCells: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (FENCE.test(line)) {
      inFence = !inFence
      headerCells = null
      continue
    }
    if (inFence) continue

    if (!isTableRow(line)) {
      headerCells = null
      continue
    }

    if (headerCells === null) {
      const next = lines[i + 1] ?? ''
      if (isTableRow(next) && isSeparatorRow(next)) {
        headerCells = countCells(line)
        i++ // consume the separator row too — it never disagrees with itself
      }
      continue
    }

    const cells = countCells(line)
    if (cells !== headerCells) {
      violations.push({
        file,
        line: i + 1,
        expectedCells: headerCells,
        actualCells: cells,
        raw: line.length > 140 ? `${line.slice(0, 140)}…` : line,
      })
    }
  }

  return violations
}
