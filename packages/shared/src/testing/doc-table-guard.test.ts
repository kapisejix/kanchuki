import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findTableCellMismatches } from './doc-table-guard.js'

const HERE = dirname(fileURLToPath(import.meta.url))
// packages/shared/src/testing -> repo root is four levels up.
const REPO_ROOT = join(HERE, '..', '..', '..', '..')

const toPosix = (p: string) => p.split(sep).join('/')

/** Every `.md` file under `dir`, relative to the repo root, POSIX-separated. */
function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) markdownFiles(full, out)
    else if (entry.endsWith('.md')) out.push(toPosix(relative(REPO_ROOT, full)))
  }
  return out
}

// Rows this guard finds but that need a content decision, not a mechanical
// fix — see docs/tasks/pending/post-referral-cleanup-and-launch.md §8.4.
// Each entry is checked BOTH ways below: it must still be a real violation
// (a fixed row with a stale entry here would silently stop being checked at
// all), and no violation may go unexplained by hiding behind an entry for a
// different row.
const KNOWN_ISSUES: ReadonlyArray<{ file: string; line: number; reason: string }> = [
  {
    file: 'docs/DESIGN.md',
    line: 803,
    reason:
      "8 rows of the HIG/Material/Mobbin comparison table fold their 'Recommended' " +
      "column into 'Reference Area' via an em-dash instead of a 4th cell — splitting " +
      'it back out is a content call (where the dash means the break), not a format fix.',
  },
  { file: 'docs/DESIGN.md', line: 804, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 805, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 806, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 807, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 808, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 809, reason: 'same table, same cause as line 803' },
  { file: 'docs/DESIGN.md', line: 810, reason: 'same table, same cause as line 803' },
  {
    file: 'docs/tasks/done/staff-invite-tokens.md',
    line: 52,
    reason:
      "The D4 decision row was never split into Decision/Rationale — it's one paragraph " +
      'with no internal delimiter at all, not a stray or missing pipe. Where to cut it is ' +
      'a content call; inventing a split would put words in the row that were never written.',
  },
]

describe('findTableCellMismatches — mechanism', () => {
  it('passes a table whose rows all match the header', () => {
    const doc = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('catches a row missing a cell', () => {
    const doc = ['| A | B | C |', '|---|---|---|', '| 1 | 2 |'].join('\n')
    const violations = findTableCellMismatches('t.md', doc)
    expect(violations).toEqual([
      { file: 't.md', line: 3, expectedCells: 3, actualCells: 2, raw: '| 1 | 2 |' },
    ])
  })

  it('catches a row with an extra cell', () => {
    const doc = ['| A | B |', '|---|---|', '| 1 | 2 | 3 |'].join('\n')
    const violations = findTableCellMismatches('t.md', doc)
    expect(violations).toEqual([
      { file: 't.md', line: 3, expectedCells: 2, actualCells: 3, raw: '| 1 | 2 | 3 |' },
    ])
  })

  it('does not mistake an escaped pipe for a column boundary', () => {
    // 3 real columns; the `\|` inside column 2 must not count as a delimiter.
    const doc = ['| A | B | C |', '|---|---|---|', String.raw`| 1 | a \| b | 3 |`].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('does not flag the separator row itself', () => {
    const doc = ['| A | B |', '| :--- | ---: |', '| 1 | 2 |'].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('a `|`-led line with no separator row after it is not a table header', () => {
    const doc = ['some prose', '| not a table |', 'more prose'].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('ignores pipes inside a fenced code block', () => {
    const doc = ['```', '| this looks like a table | but is not |', '|---|', '```'].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('a non-table line ends the table, so unrelated pipe text after it is not checked against it', () => {
    const doc = ['| A | B |', '|---|---|', '| 1 | 2 |', '', 'x | y'].join('\n')
    expect(findTableCellMismatches('t.md', doc)).toEqual([])
  })

  it('re-anchors on the next header + separator pair after a table ends', () => {
    const doc = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '| X | Y | Z |',
      '|---|---|---|',
      '| bad |',
    ].join('\n')
    const violations = findTableCellMismatches('t.md', doc)
    expect(violations).toEqual([
      { file: 't.md', line: 7, expectedCells: 3, actualCells: 1, raw: '| bad |' },
    ])
  })
})

describe('findTableCellMismatches — every table in the docs', () => {
  const files = markdownFiles(REPO_ROOT).filter(
    (f) => f === 'CLAUDE.md' || f.startsWith('docs/'),
  )

  it('found at least the docs known to have tables (sanity check on the file walk)', () => {
    expect(files).toContain('CLAUDE.md')
    expect(files).toContain('docs/BUILD-LOG.md')
  })

  const allViolations = files.flatMap((f) =>
    findTableCellMismatches(f, readFileSync(join(REPO_ROOT, f), 'utf8')),
  )

  it('every violation is either fixed or named in KNOWN_ISSUES', () => {
    const unexplained = allViolations.filter(
      (v) => !KNOWN_ISSUES.some((k) => k.file === v.file && k.line === v.line),
    )
    expect(unexplained).toEqual([])
  })

  it('KNOWN_ISSUES has no stale entry (a row that was fixed but never removed here)', () => {
    const stillBroken = new Set(allViolations.map((v) => `${v.file}:${v.line}`))
    const stale = KNOWN_ISSUES.filter((k) => !stillBroken.has(`${k.file}:${k.line}`))
    expect(stale).toEqual([])
  })
})
