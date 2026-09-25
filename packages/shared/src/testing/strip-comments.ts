// ─── Source-scanning helper: comment stripping ─────────────────────
//
// WHY THIS IS SHARED (and not six copies)
//
// Every structural guard in this repo that reads source files out of the tree
// needs the same first step: drop comments, so prose that *discusses* a banned
// thing is not counted as the thing itself.
//
// Eleven call sites each wrote their own. Two looked like this:
// `.replace(/\/\/[^\n]*/g, '')`. Two used `/(^|\s)\/\/[^\n]*/`. The remaining
// seven used the correct `/(^|[^:])\/\/[^\n]*/` form — correct, and still seven
// more copies of a regex whose failure mode is invisible, which is why they were
// migrated too rather than left as "the ones that happen to work".
//
// (The count of eleven is itself a correction: the first pass inventoried six,
// migrated them, and the docs said the regex then existed in one file. A re-grep
// before those docs were finalised found five more. Same lesson as the regex,
// one level up — an inventory nothing re-derives is an inventory that drifts.)
//
// That last form treats EVERY `//` as a comment opener, including the `//` in
// `intent://`, `https://` and `kanchuki://`. On any line mentioning one of them
// it deleted the rest of the line: precisely the text a scan is looking for,
// leaving that arm **vacuously green** — reporting "nothing found" for exactly
// the same reason it would report it with the banned thing present.
//
// That is not hypothetical. `apps/web/src/lib/__tests__/deep-links.test.ts` had
// the naive form, and while falsifying it a hand-written link was typed back
// into a page — the page's own assertion went red and the source-scan arms
// stayed green. RC-041's fix had no working guard until the stripper was fixed.
//
// WHY THIS EXACT FORM
//
//   - `(^|[^:])` — the `//` only opens a comment when the character before it is
//     not `:`. `intent://`, `https://`, `kanchuki://` survive intact.
//   - not `(^|\s)` — a comment that follows code with no space, `x();// note`,
//     is stripped too. The `(^|\s)` form silently leaves that comment in, which
//     means a banned string mentioned there fails the build later.
//   - `$1` — the captured character goes back. Dropping it would join the two
//     sides of the seam (`const a = 1;` + `// x` → `const a = 1;` is fine, but
//     `foo` + `// x` + `bar` would become `foobar`, inventing a token that was
//     never written and could match — or hide — a pattern).
//   - `/gm` — every line, and `^` matches at each line start, not only the file
//     head, so a comment on its own line is stripped everywhere.
//
// KNOWN LIMIT, stated rather than papered over: a `//` that immediately follows
// a `:` is never treated as a comment. That is the whole point (`intent://`,
// `https://`), but it is a heuristic — text written as `x:// note` keeps its
// comment, so a banned string there produces a false *failure*. That is the safe
// direction to be wrong in: a false failure is loud and names the file, while a
// false pass is silent and is the bug this helper exists to prevent.
//
// (A `//` after a colon *and a space* is still stripped — `label: // note` goes,
// because the character before `//` is the space. The exemption needs the colon
// to be adjacent. Asserted in the suite so the distinction stays visible.)
//
// This is not a parser and does not try to be: it must not need to understand
// the language it reads, because it is applied to TypeScript, SQL and k6 scripts
// alike. It only has to be *conservative about what it deletes*.
//
// WHY THE ORDER IS A PARAMETER, AND WHY THE DEFAULT IS `block-first`
//
// The two passes do not commute, and one direction *vacates a scan*:
//
//   - A line comment that itself contains `/*` (real case: a route header
//     reading `// mounted under /v1/public/*;`) makes a block-first pass open a
//     block at that `/*` and run to the next real `*/` — eating live code that
//     sits between them. A scan over the result is then quiet for exactly the
//     reason a broken detector is quiet: the text it looks for is gone.
//   - The other direction is milder: a block comment containing `//`
//     (`/* see // note */`) gets cut at the `//`, leaving a fragment. That is a
//     false *failure*, the safe direction, but it is still a behaviour change.
//
// So the order is a parameter with a default rather than a house rule. The
// default is what the migrated callers already did; each caller that needs the
// other order says so at its call site, with the rake it is avoiding.

/** Which pass runs first. They do not commute — see the note above. */
export type StripOrder = 'block-first' | 'line-first';

const BLOCK = /\/\*[\s\S]*?\*\//g;
const LINE = /(^|[^:])\/\/[^\n]*/gm;

/** Drop `/* … *​/` blocks and `// …` line comments, keeping the seam character. */
export function stripComments(source: string, order: StripOrder = 'block-first'): string {
  // Module-level regexes are safe with `String.replace`: for a global regex it
  // resets `lastIndex` before and after the call.
  return order === 'line-first'
    ? source.replace(LINE, '$1').replace(BLOCK, '')
    : source.replace(BLOCK, '').replace(LINE, '$1');
}
