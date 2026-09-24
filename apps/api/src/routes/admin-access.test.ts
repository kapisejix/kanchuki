// Derivation guard for the shared admin-access list (RC-034).
//
// WHY THIS TEST EXISTS
//
// `adminAuthPreHandler` decides whether a plain ADMIN key may reach an admin
// surface by asking `isSuperAdminOnlyAdminPath()`. That predicate only knows the
// segments somebody wrote into `packages/shared/src/constants/admin-access.ts`,
// so the security property is really "every registered admin route has been
// classified as super-admin-only or standard-admin". Nothing in the runtime can
// enforce that — an unlisted segment simply is not protected.
//
// This test closes that gap by DERIVING the segment set from the route sources
// themselves. It fails when a segment exists but was never classified, and when
// the list contains a segment that protects nothing. The point is that adding an
// admin route now forces a decision instead of silently defaulting to public.
//
// Why a source scan rather than booting Fastify: the route modules import Prisma
// and the AI clients, and several already mock `@kanchuki/shared`; a real build
// would test the plugin graph while still not proving anything about the LIST.
// The scan is deliberately dumb (literal first path segment of each declaration)
// so that it can only under-derive — and under-deriving is caught by the
// no-dead-entries assertion below, not waved through.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STANDARD_ADMIN_ADMIN_SEGMENTS,
  SUPER_ADMIN_ONLY_ADMIN_SEGMENTS,
  adminPathSegment,
  isSuperAdminOnlyAdminPath,
} from '@kanchuki/shared';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/api/src/routes → apps/api → apps → repo root */
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

// ─── Source scanning ───────────────────────────────────────────────

/** Strip comments so a documented example path isn't mistaken for a route. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SERVER_METHOD_CALL =
  /server\.(?:get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`]+)['"`]/g;
const SERVER_ROUTE_CALL = /server\.route\(\s*\{[\s\S]{0,400}?url:\s*['"`]([^'"`]+)['"`]/g;

function segmentsInSource(source: string): string[] {
  const clean = stripComments(source);
  const found: string[] = [];
  for (const regex of [SERVER_METHOD_CALL, SERVER_ROUTE_CALL]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null = regex.exec(clean);
    while (match) {
      const path = match[1] ?? '';
      // Routes inside these modules are declared relative to the /v1/admin
      // mount, so the first non-empty path segment IS the segment.
      const segment = path.split('/').filter(Boolean)[0];
      if (segment) found.push(segment.toLowerCase());
      match = regex.exec(clean);
    }
  }
  return found;
}

/**
 * First path segment of every registered `/v1/admin/<segment>` route, mapped to
 * the file that declares it — so a failure message points at the source to read
 * instead of just naming a segment.
 */
function derivedApiSegments(): Map<string, string> {
  const files = [
    ...listFiles(join(HERE, 'admin')),
    ...listFiles(join(HERE, 'admin-settings')),
    // The aggregator itself owns /login, /session and /csrf-token.
    join(HERE, 'admin.ts'),
    join(HERE, 'admin-settings.ts'),
  ];
  const segments = new Map<string, string>();
  for (const file of files) {
    const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
    for (const segment of segmentsInSource(readFileSync(file, 'utf8'))) {
      if (!segments.has(segment)) segments.set(segment, rel);
    }
  }
  return segments;
}

/** `segment ← declaring file` lines — so a failure says where to look, not just what. */
function located(segments: Map<string, string>, names: string[]): string {
  return names.map((name) => `  ${name}  ←  ${segments.get(name) ?? '(web page only)'}`).join('\n');
}

/** Every `/admin/<segment>` page the web panel serves. */
function derivedWebSegments(): string[] {
  const adminDir = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'admin');
  const segments = new Set<string>();
  for (const entry of readdirSync(adminDir)) {
    if (entry === 'components' || entry === '__tests__') continue;
    const full = join(adminDir, entry);
    if (!statSync(full).isDirectory()) continue;
    // A directory only counts as a surface if it actually renders a page.
    try {
      statSync(join(full, 'page.tsx'));
    } catch {
      continue;
    }
    segments.add(entry.toLowerCase());
  }
  return [...segments].sort();
}

const CLASSIFIED: readonly string[] = [
  ...SUPER_ADMIN_ONLY_ADMIN_SEGMENTS,
  ...STANDARD_ADMIN_ADMIN_SEGMENTS,
];

// ─── Tests ─────────────────────────────────────────────────────────

describe('admin access list completeness (RC-034)', () => {
  const apiSegmentMap = derivedApiSegments();
  const apiSegments = [...apiSegmentMap.keys()].sort();
  const webSegments = derivedWebSegments();

  it('derives a non-trivial segment set from both apps', () => {
    // Guards the guard: if the regexes stop matching (a new declaration style,
    // a moved directory), every assertion below would pass vacuously.
    expect(apiSegments.length).toBeGreaterThan(25);
    expect(webSegments.length).toBeGreaterThan(25);
    for (const expected of ['referral-settings', 'commission', 'retailers']) {
      expect(apiSegments, `derivation missed ${expected}`).toContain(expected);
      expect(webSegments, `derivation missed ${expected}`).toContain(expected);
    }
  });

  it('classifies every /v1/admin route segment', () => {
    const unclassified = apiSegments.filter((s) => !CLASSIFIED.includes(s));
    expect(
      unclassified,
      `These admin route segments are in NEITHER list, so a plain ADMIN key can reach them — the guard can only protect what is classified. Add each to SUPER_ADMIN_ONLY_ADMIN_SEGMENTS (money, credentials, tax, platform config, destructive) or STANDARD_ADMIN_ADMIN_SEGMENTS (day-to-day ops) in packages/shared/src/constants/admin-access.ts:\n${located(apiSegmentMap, unclassified)}`,
    ).toEqual([]);
  });

  it('classifies every web /admin page segment', () => {
    const unclassified = webSegments.filter((s) => !CLASSIFIED.includes(s));
    expect(
      unclassified,
      'These admin PAGES are in neither list, so the layout guard renders them to a ' +
        'standard Admin while the nav hides them. Classify them in ' +
        'packages/shared/src/constants/admin-access.ts.',
    ).toEqual([]);
  });

  it('has no entry that protects nothing', () => {
    const dead = CLASSIFIED.filter((s) => !apiSegments.includes(s) && !webSegments.includes(s));
    expect(
      dead,
      'These segments match no route and no page, so they protect nothing and make ' +
        'the list unreadable. Remove them — if the surface returns later, the ' +
        'completeness assertions above force a fresh decision.',
    ).toEqual([]);
  });

  it('keeps the two lists disjoint', () => {
    const overlap = SUPER_ADMIN_ONLY_ADMIN_SEGMENTS.filter((s) =>
      (STANDARD_ADMIN_ADMIN_SEGMENTS as readonly string[]).includes(s),
    );
    expect(overlap, 'A segment cannot be both restricted and permitted').toEqual([]);
  });

  it('gates the surfaces this change was made for', () => {
    // The regression this whole file exists to prevent: referral payout terms and
    // the commission ledger were editable by a plain ADMIN key.
    for (const path of [
      '/v1/admin/referral-settings',
      '/v1/admin/referral-settings/anything',
      '/v1/admin/commission',
      '/v1/admin/commission/expenses?month=2026-09',
      '/v1/admin/plan-pricing',
      '/v1/admin/invoices',
      '/v1/admin/database/deletion-vault',
    ]) {
      expect(isSuperAdminOnlyAdminPath(path), `${path} must require Super Admin`).toBe(true);
    }
  });

  it('gates the two surfaces RC-034 left flagged (2026-09-24 follow-up)', () => {
    // RC-034 shipped with `reports` and `team-members` deliberately left in the
    // standard-admin list, each carrying an in-file note saying why — the
    // decision was flagged rather than made. Both are now decided the other
    // way: `/admin/team-members` manages staff accounts, and `/admin/reports`
    // carries the GST figures. Pinned so an edit that moves either back fails
    // here instead of silently reopening the page.
    //
    // The API half of these two segments is `/v1/team/*`, which this list does
    // NOT cover — see the scope note in admin-access.ts. That remains open.
    for (const path of [
      '/admin/team-members',
      '/admin/team-members/anything',
      '/admin/reports',
      '/admin/reports/gst',
      '/v1/admin/reports',
    ]) {
      expect(isSuperAdminOnlyAdminPath(path), `${path} must require Super Admin`).toBe(true);
    }
  });
});

describe('adminPathSegment', () => {
  it('handles both apps and strips query/hash', () => {
    expect(adminPathSegment('/v1/admin/commission/expenses?x=1#y')).toBe('commission');
    expect(adminPathSegment('/admin/referral-settings')).toBe('referral-settings');
    expect(adminPathSegment('/v1/admin/COMMISSION')).toBe('commission');
  });

  it('does not mistake a sibling segment for a gated one', () => {
    // The fail-open bug in the old `startsWith` check: /admin/commission-x
    // matched the 'commission' prefix but is a different surface.
    expect(isSuperAdminOnlyAdminPath('/v1/admin/commission-x')).toBe(false);
    expect(isSuperAdminOnlyAdminPath('/v1/admin/settings-export')).toBe(false);
  });

  it('returns null for non-admin paths and the bare root', () => {
    expect(adminPathSegment('/v1/retailers/me')).toBeNull();
    expect(adminPathSegment('/admin')).toBeNull();
    expect(adminPathSegment('/v1/admin/')).toBeNull();
    expect(adminPathSegment(null)).toBeNull();
    expect(adminPathSegment(undefined)).toBeNull();
  });

  it('does not treat a standard-admin surface as gated', () => {
    for (const path of ['/v1/admin/retailers', '/admin/customers', '/v1/admin/stats']) {
      expect(isSuperAdminOnlyAdminPath(path), `${path} must stay reachable`).toBe(false);
    }
  });

  it('is reachable from the repo-relative route sources it guards', () => {
    // Keeps REPO_ROOT honest — if the test moves, the derivation above would
    // silently scan nothing.
    expect(relative(REPO_ROOT, join(HERE, 'admin'))).toBe(
      join('apps', 'api', 'src', 'routes', 'admin'),
    );
  });
});
