/**
 * Mechanical split of apps/api/src/routes/admin.ts (3125 lines) into:
 *   - admin-auth.ts            — auth helpers (validAdminKey, sessions, IP allowlist, preHandler)
 *   - admin/<domain>.ts        — route groups, each a self-installing plugin
 *   - admin.ts (rewritten)     — thin aggregator: login + csrf-token + registers sub-plugins
 *
 * Route bodies moved VERBATIM — zero logic changes. Imports pruned per module
 * by identifier usage. admin.ts re-exports the auth helpers for back-compat
 * (team.ts + tests + admin-settings.ts import from './admin.js').
 *
 * Run: node scripts/split-admin-routes.mjs
 * Then: cd apps/api && npx tsc --noEmit && npx vitest run
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const file = 'apps/api/src/routes/admin.ts';
const raw = readFileSync(file, 'utf8');
const lines = raw.split(/\r?\n/);

// ─── Helpers ───────────────────────────────────────────────────────
// The auth helpers live at the top of admin.ts (before `export const adminRoutes`).
const PLUGIN_START = lines.findIndex((l) => l.includes('export const adminRoutes'));
if (PLUGIN_START === -1) throw new Error('Could not find adminRoutes plugin start');

const authHelperBlock = lines.slice(0, PLUGIN_START); // imports + type + helpers

// Extract ALL import statements in the file header (imports may be
// interleaved with type aliases, e.g. the IntegrationKeyEntry type sits
// between two import blocks in the original admin.ts).
function extractImports(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^import\s/.test(l)) {
      let block = l;
      while (!block.includes(';') && i + 1 < lines.length) {
        i++;
        block += '\n' + lines[i];
      }
      out.push(block);
    }
    i++;
  }
  return out;
}
const allImports = extractImports(lines);

// Prune imports for a body: keep an import only if any named identifier is used.
function pruneImports(body, imports) {
  const kept = [];
  for (const stmt of imports) {
    const specMatch = stmt.match(/^import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?$/);
    if (!specMatch) continue;
    const spec = specMatch[1];
    const names = [];
    const star = spec.match(/\*\s+as\s+(\w+)/);
    if (star) names.push(star[1]);
    const def = spec.match(/^(\w+)/);
    if (def && !spec.includes('{') && !star) names.push(def[1]);
    for (const m of spec.matchAll(/\{([^}]+)\}/g)) {
      for (const part of m[1].split(',')) {
        const p = part.trim().split(/\s+as\s+/).pop();
        if (p) names.push(p);
      }
    }
    const used = names.some((n) => new RegExp(`\\b${n}\\b`).test(body));
    if (used) kept.push(stmt);
  }
  return kept;
}

// ─── 1. Write admin-auth.ts ────────────────────────────────────────
// Body of auth helpers = everything in authHelperBlock after the imports+type,
// minus the type alias (keep it here since it's part of the helper surface).
const helperContent = authHelperBlock.join('\n');
const helperImports = pruneImports(helperContent, allImports);
// Keep everything from the first `export function validAdminKey` declaration
// onward — imports + type alias are all before it.
const anchorIdx = authHelperBlock.findIndex((l) => l.includes('export function validAdminKey'));
if (anchorIdx === -1) throw new Error('Could not find validAdminKey anchor in admin.ts header');
const helperBody = authHelperBlock.slice(anchorIdx).join('\n');
// Drop FastifyPluginAsync from the pruned set if the template already adds it.
const helperImportsNoType = helperImports.filter((imp) => !imp.includes('FastifyPluginAsync'));
const authFile = `// Auth helpers extracted from admin.ts (see scripts/split-admin-routes.mjs).
// Kept here so domain modules can share them without a circular import back
// into the aggregator. admin.ts re-exports these for back-compat.
import type { FastifyPluginAsync } from 'fastify';

${helperImportsNoType.join('\n')}
${helperBody}
`;
// Ensure FastifyPluginAsync import is only added if used
writeFileSync('apps/api/src/routes/admin-auth.ts', authFile);
console.log('Wrote apps/api/src/routes/admin-auth.ts');

// ─── 2. Section detection ──────────────────────────────────────────
const MARKERS = [];
for (let i = PLUGIN_START; i < lines.length; i++) {
  // Top-level section markers sit at exactly 2-space indent with 3+ box
  // chars, e.g. "  // ─── POST /admin/login ───...". Deeper-indented
  // "// ── ..." lines are sub-comments nested INSIDE route handlers and
  // must NOT be treated as section boundaries.
  const m = lines[i]?.match(/^ {2}\/\/ [─═]{3,} ([^─═].*?)(?: [─═]{2,})?$/);
  if (m && m[1].trim().length > 2) MARKERS.push({ line: i + 1, title: m[1].trim() });
}
// F-015 / F-023 banner lines use ═ and might have been missed
for (let i = PLUGIN_START; i < lines.length; i++) {
  const l = lines[i] ?? '';
  if (/^ {2}\/\/ .*F-015: ACCOUNT SUSPENSION/.test(l))
    MARKERS.push({ line: i + 1, title: 'F-015: ACCOUNT SUSPENSION' });
  if (/^ {2}\/\/ .*AI Provider Registry \(F-023\)/.test(l))
    MARKERS.push({ line: i + 1, title: 'AI Provider Registry (F-023)' });
}
MARKERS.sort((a, b) => a.line - b.line);
// dedupe
const uniq = [];
for (const m of MARKERS) if (!uniq.some((u) => u.line === m.line)) uniq.push(m);
MARKERS.length = 0;
MARKERS.push(...uniq);

function moduleFor(title) {
  const t = title.toLowerCase();
  if (t.includes('login') || t.includes('csrf')) return null; // stays in aggregator
  if (t.includes('stats') || t.includes('retailer') || t.includes('customer') ||
      t.includes('extend-trial') || t.includes('change-plan') || t.includes('override') ||
      t.includes('suspend') || t.includes('unsuspend') || t.includes('block') || t.includes('unblock'))
    return 'admin-retailers';
  if (t.includes('plan') || t.includes('billing') || t.includes('addon') || t.includes('usage') ||
      t.includes('tier') || t.includes('category') || t.includes('feature'))
    return 'admin-plans';
  if (t.includes('activity') || t.includes('audit')) return 'admin-activity';
  if (t.includes('background-image')) return 'admin-media';
  if (t.includes('query') || t.includes('schema') || t.includes('database/status')) return 'admin-data';
  if (t.includes('integration')) return 'admin-integrations';
  if (t.includes('backup')) return 'admin-backups';
  if (t.includes('deletion-vault') || t.includes('suspension')) return 'admin-moderation';
  if (t.includes('ai-provider') || t.includes('ai-usage')) return 'admin-ai';
  return 'admin-misc';
}

const sections = MARKERS.map((m, idx) => {
  const next = MARKERS[idx + 1];
  const end = next ? next.line - 1 : lines.length - 1; // keep trailing `};` check below
  return { title: m.title, start: m.line, end, module: moduleFor(m.title) };
});

// ─── 3. Slice into modules ─────────────────────────────────────────
const modules = new Map(); // module -> lines[]
for (const s of sections) {
  if (!s.module) continue;
  // trim to route bodies: from the first server.* or comment marker in this section
  let chunk = lines.slice(s.start - 1, s.end);
  // drop a trailing `};` if the section ended exactly at file end (last section)
  if (s.end >= lines.length - 1) {
    while (chunk.length && chunk[chunk.length - 1]?.trim() === '};') chunk.pop();
    while (chunk.length && chunk[chunk.length - 1]?.trim() === '') chunk.pop();
  }
  if (!modules.has(s.module)) modules.set(s.module, []);
  modules.get(s.module).push(...chunk);
}

// ─── 4. Write module files ─────────────────────────────────────────
const OUT_DIR = 'apps/api/src/routes/admin';
mkdirSync(OUT_DIR, { recursive: true });

// Sanitize module name into a valid JS identifier (dashes -> camelCase).
const ident = (name) =>
  name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9_$]/g, '');

for (const [name, bodyLines] of modules) {
  const id = ident(name);
  let body = bodyLines.join('\n');
  // Inject IntegrationKeyEntry type where used
  if (/\bIntegrationKeyEntry\b/.test(body) && !/type IntegrationKeyEntry/.test(body)) {
    body = `type IntegrationKeyEntry = (typeof INTEGRATION_KEYS)[number];\n${body}`;
  }
  const imports = pruneImports(body, allImports);
  const content = `// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

${imports.join('\n').replaceAll("from '../plugins/", "from '../../plugins/")}
import { adminAuthPreHandler } from '../admin-auth.js';

export const ${id}Routes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

${body}
};
`;
  writeFileSync(`${OUT_DIR}/${name}.ts`, content);
  console.log(`Wrote admin/${name}.ts (${bodyLines.length} lines)`);
}

// ─── 5. Rewrite admin.ts as aggregator ─────────────────────────────
// Keep: login + csrf-token sections (module === null).
const keptSections = sections.filter((s) => s.module === null);
const aggregatorBody = [];
for (const s of keptSections) {
  const chunk = lines.slice(s.start - 1, s.end);
  aggregatorBody.push(...chunk);
}

const registrations = [...modules.keys()]
  .map((name) => `  // ${name} — auto-split module\n  await server.register(${ident(name)}Routes);`)
  .join('\n');

const aggBodyText = aggregatorBody.join('\n');
const aggImports = pruneImports(aggBodyText + registrations, allImports);
// Merge same-module imports into one line (union of names) and dedupe.
const forced = [
  `import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';`,
  `import { forbidden, validationError } from '../plugins/error-handler.js';`,
  `import { verifyPassword } from '../plugins/team-auth.js';`,
  `import { z } from 'zod';`,
  `import { signAdminSession } from './admin-auth.js';`,
  ...aggImports,
];
const byModule = new Map(); // module -> Set(names)
let defaultImport = null;
for (const imp of forced) {
  const m = imp.match(/^import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?$/);
  if (!m) continue;
  const spec = m[1];
  const from = m[2];
  if (spec.includes('{')) {
    const names = [...spec.matchAll(/\{([^}]+)\}/g)][0][1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!byModule.has(from)) byModule.set(from, new Set());
    names.forEach((n) => byModule.get(from).add(n));
  } else if (/^\*\s+as\s+/.test(spec)) {
    if (!byModule.has(from)) byModule.set(from, new Set());
    byModule.get(from).add(spec.trim());
  } else if (spec.trim() && !spec.includes('{')) {
    defaultImport = { from, name: spec.trim() };
  }
}
const finalImports = [];
for (const [from, names] of byModule) {
  const sorted = [...names].sort();
  finalImports.push(`import { ${sorted.join(', ')} } from '${from}';`);
}
if (defaultImport) {
  finalImports.push(`import ${defaultImport.name} from '${defaultImport.from}';`);
}

const newAdmin = `// Admin routes aggregator — auth helpers in admin-auth.ts, domain modules in ./admin/.
// Auto-split via scripts/split-admin-routes.mjs. Re-exports auth helpers for
// back-compat (team.ts, tests, admin-settings.ts import from './admin.js').
import type { FastifyPluginAsync } from 'fastify';

${finalImports.join('\n')}
import { adminAuthPreHandler } from './admin-auth.js';
import { ${[...modules.keys()].map((n) => `${ident(n)}Routes`).join(', ')} } from './admin/index.js';

export {
  validAdminKey,
  signAdminSession,
  verifyAdminSession,
  ipInCidr,
  isIpAllowlisted,
  adminAuthPreHandler,
} from './admin-auth.js';

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

${aggregatorBody.join('\n')}
${registrations}
};
`;
writeFileSync(file, newAdmin);
console.log('Rewrote admin.ts aggregator.');

// Barrel
const barrel = `// Barrel — re-exports the auto-split admin domain modules.
${[...modules.keys()].map((n) => `export { ${ident(n)}Routes } from './${n}.js';`).join('\n')}
`;
writeFileSync(`${OUT_DIR}/index.ts`, barrel);
console.log('Wrote admin/index.ts barrel.');
