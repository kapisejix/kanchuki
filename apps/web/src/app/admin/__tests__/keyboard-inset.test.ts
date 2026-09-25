import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// iOS Safari does not reflow `position: fixed` for the on-screen keyboard, so
// every fixed overlay that holds a text field needs the visual-viewport inset —
// in the overlay's padding, and in a `vh`-sized panel's cap. That used to be a
// `useKeyboardInset` call plus two hand-written styles per modal, which is
// exactly the shape that rots silently: a new admin screen adds a dialog with a
// field in it, nobody remembers the inset, and the field sits under the
// keyboard on a phone with nothing failing anywhere.
//
// `@/components/Sheet` now owns it, so the invariant is adoption, not
// arithmetic. The sets below are *derived from the sources* rather than listed:
// every admin file that renders a `<Sheet>` must be classified, and so must
// every file that still has a `fixed inset-0` overlay with a text field but no
// `<Sheet>`. Adding an unclassified one to either side fails and names it.

const HERE = dirname(fileURLToPath(import.meta.url))
const ADMIN_DIR = join(HERE, '..')
const WEB_SRC = join(ADMIN_DIR, '..', '..')

const toPosix = (p: string) => p.split(sep).join('/')

/** Every `.tsx` under a directory, relative to it and POSIX-separated. */
function sources(dir: string, base: string = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, base, out)
    else if (entry.endsWith('.tsx')) out.push(toPosix(relative(base, full)))
  }
  return out.sort()
}

const read = (file: string) => readFileSync(join(ADMIN_DIR, file), 'utf8')

const SHEET_TAG = '<Sheet'
const HAS_OVERLAY = 'fixed inset-0'
const TEXT_FIELD = /<(input|textarea|select)\b/

/** The one-line correction this component exists to replace. */
const OVERLAY_INSET_STYLE = 'style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}'

const adminSources = () => sources(ADMIN_DIR)

/**
 * Files that already route their overlay through the shared component. The
 * panel's inset comes from there, so there is nothing per-file left to check
 * beyond the fact that it *is* the component — no bespoke `useKeyboardInset`
 * arithmetic can hide in a file that never calls the hook.
 */
const ADOPTED: string[] = [
  'ai-providers/page.tsx',
  'commission/page.tsx',
  'customers/page.tsx',
  'database/query/page.tsx',
  'festivals/page.tsx',
  'operations/pending/page.tsx',
  'photo-cleanup-test/EffectsCatalog.tsx',
  'retailers/[id]/page.tsx',
  'team-members/page.tsx',
]

/**
 * Files the derivation matches on the un-adopted side, but which have no field
 * inside the overlay.
 *
 * `marker` is what makes each exclusion self-checking: it is a string that only
 * the input-free overlay carries, so converting one of these lightboxes into a
 * real form (which would then need the inset) drops the marker and fails.
 */
const EXCLUDED: Record<string, { reason: string; marker?: string }> = {
  'background-images/page.tsx': {
    reason: 'the only overlay is a cursor-zoom-out image lightbox; its input is in page flow',
    marker: 'cursor-zoom-out',
  },
  'bug-reports/page.tsx': {
    reason: 'the only overlay is the screenshot lightbox; its inputs are the filter bar in page flow',
    marker: '<motion.img',
  },
  'photo-cleanup-test/page.tsx': {
    reason: 'the only overlay is the candidate-image lightbox; its inputs are the bench form in page flow',
    marker: 'object-contain',
  },
  'post-templates/page.tsx': {
    reason: 'the only overlay is the thumbnail lightbox; the row editor is in page flow',
    marker: 'cursor-zoom-out',
  },
  'studio-styles/page.tsx': {
    reason: 'the only overlay is the thumbnail lightbox; the style editor is in page flow',
    marker: 'cursor-zoom-out',
  },
  'suits-designs/page.tsx': {
    reason: 'the only overlay is the design lightbox; its inputs are in page flow',
    marker: 'cursor-zoom-out',
  },
  'social-templates/page.tsx': {
    reason:
      'the overlay is a read-only detail modal (labels only) and the file has no <input> at all — ' +
      'both <select>s are the page-flow filter bar, ahead of the overlay',
  },
}

/** Files whose overlay is the shared component. */
const adopted = () => adminSources().filter((f) => read(f).includes(SHEET_TAG))

/** Files with a fixed overlay and a text field that have *not* adopted it. */
const unadopted = () =>
  adminSources().filter((f) => {
    const src = read(f)
    return src.includes(HAS_OVERLAY) && TEXT_FIELD.test(src) && !src.includes(SHEET_TAG)
  })

/**
 * The inset arithmetic exists in one place — `components/Sheet.tsx`, fed by
 * `lib/keyboard-inset.ts`. Anything else reading the hook is a second copy of
 * the correction, which is how the two drifted apart in the first place.
 */
function filesReadingTheHook(dir: string, base: string = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) filesReadingTheHook(full, base, out)
    else if (/\.tsx?$/.test(entry) && !/__tests__|\.test\.tsx?$/.test(entry)) {
      if (readFileSync(full, 'utf8').includes('useKeyboardInset')) out.push(toPosix(relative(base, full)))
    }
  }
  return out.sort()
}

describe('admin fixed-overlay keyboard insets', () => {
  it('adopts the shared sheet in exactly the classified files', () => {
    expect(adopted()).toEqual([...ADOPTED].sort())
  })

  it('classifies every remaining overlay that holds a text field', () => {
    expect(unadopted()).toEqual([...Object.keys(EXCLUDED)].sort())
  })

  it('never lists the same file as both adopted and excluded', () => {
    expect(ADOPTED.filter((f) => f in EXCLUDED)).toEqual([])
  })

  it.each(ADOPTED)('routes %s through the shared sheet', (file) => {
    const src = read(file)
    expect(src).toContain("from '@/components/Sheet'")
    expect(src).toContain(SHEET_TAG)
    // The scrim, centring and z-index are per-surface, so every caller passes
    // its own — a bare `<Sheet>` would render an unstyled `fixed inset-0`.
    expect(src).toContain('overlayClassName=')
    // A hand-rolled inset alongside the component is the bug this guards.
    expect(src).not.toContain('useKeyboardInset')
    expect(src).not.toContain(OVERLAY_INSET_STYLE)
  })

  it.each(Object.entries(EXCLUDED))('leaves %s unwired', (file, { reason, marker }) => {
    const src = read(file)
    expect(reason.length).toBeGreaterThan(20)
    expect(src).not.toContain(SHEET_TAG)
    expect(src).not.toContain('useKeyboardInset')
    if (marker) expect(src).toContain(marker)
  })

  it('keeps the inset arithmetic in one place', () => {
    expect(filesReadingTheHook(WEB_SRC)).toEqual([
      'components/Sheet.tsx',
      'lib/keyboard-inset.ts',
    ])
  })

  it('reads social-templates as a read-only modal rather than an unclassified one', () => {
    const src = read('social-templates/page.tsx')
    // No text entry at all — the two <select>s are the filter bar, and every one
    // of them appears before the overlay opens, so neither can be inside it.
    expect(src).not.toMatch(/<input|<textarea/)
    const overlay = src.indexOf(HAS_OVERLAY)
    expect(overlay).toBeGreaterThan(-1)
    for (const match of Array.from(src.matchAll(/<select\b/g))) {
      expect(match.index).toBeLessThan(overlay)
    }
  })
})
