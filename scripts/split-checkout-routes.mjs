/**
 * Mechanical split of apps/api/src/routes/checkout.ts (1092 lines) into:
 *   - checkout/checkout-helpers.ts — shared helpers (razorpayAsRetailer,
 *     verifyRetailerWebhookSignature, computeGst, generateGstInvoiceNumber)
 *     + schemas (ConnectPaymentAccountSchema, CreateOrderSchema,
 *     UpdateOrderStatusSchema, RazorpayOrder)
 *   - checkout/<domain>.ts         — route groups, each a self-installing plugin
 *   - checkout.ts (rewritten)      — thin aggregator
 *
 * Route bodies moved VERBATIM — zero logic changes. Imports pruned per module
 * by identifier usage. The raw-body content-type parser stays in the webhook
 * module (its only consumer). FastifyPluginAsync/FastifyRequest type imports
 * are merged into the type import line where used.
 *
 * Run: node scripts/split-checkout-routes.mjs
 * Then: cd apps/api && npx tsc --noEmit && npx vitest run
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const file = 'apps/api/src/routes/checkout.ts';
const raw = readFileSync(file, 'utf8');
const lines = raw.split(/\r?\n/).map((l) => l.replace(/\r$/, ''));

// ─── Helpers ───────────────────────────────────────────────────────
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

// ─── 1. Write checkout-helpers.ts ─────────────────────────────────
// Helpers live between '// ─── Helpers' and 'export const checkoutRoutes'.
const PLUGIN_START = lines.findIndex((l) => l.includes('export const checkoutRoutes'));
if (PLUGIN_START === -1) throw new Error('Could not find checkoutRoutes plugin start');

const helperBlock = lines.slice(0, PLUGIN_START); // imports + helpers + schemas
// Ensure the output directory exists before any writes
const OUT_DIR = 'apps/api/src/routes/checkout';
mkdirSync(OUT_DIR, { recursive: true });
// Split into (imports) + (helpers+schemas) — everything after the last import
let lastImportIdx = 0;
for (let i = 0; i < helperBlock.length; i++) {
  if (/^import\s/.test(helperBlock[i])) lastImportIdx = i;
  else if (lastImportIdx && !/^\s*$/.test(helperBlock[i]) && i > lastImportIdx) {
    // keep scanning — imports and type aliases may interleave
  }
}
// Find the first non-import, non-blank, non-comment line
let bodyStart = helperBlock.findIndex((l) => /^(async function|function|const [A-Za-z_]|interface )/.test(l));
if (bodyStart === -1) throw new Error('Could not find helper body start');
const helpersBody = helperBlock
  .slice(bodyStart)
  .join('\n')
  // Export the shared surface: helper functions, schemas, and the order type.
  .replace(/^async function (razorpayAsRetailer|verifyRetailerWebhookSignature)/gm, 'export async function $1')
  .replace(/^function (computeGst|generateGstInvoiceNumber)/gm, 'export function $1')
  .replace(/^const (ConnectPaymentAccountSchema|CreateOrderSchema|UpdateOrderStatusSchema)/gm, 'export const $1')
  .replace(/^interface (RazorpayOrder)/gm, 'export interface $1');
const helpersImports = pruneImports(helpersBody, allImports);
const helpersFile = `// Shared checkout helpers/schemas extracted from checkout.ts
// (see scripts/split-checkout-routes.mjs). Route modules import from here.
${helpersImports.join('\n')}
${helpersBody}
`;
writeFileSync('apps/api/src/routes/checkout/checkout-helpers.ts', helpersFile);
console.log('Wrote checkout/checkout-helpers.ts');

// ─── 2. Section detection ──────────────────────────────────────────
// Route groups are delimited by banner comments at 2-space indent:
//   // ═══════════════════════════════════════════════════════════════
//   //  <TITLE>
//   // ═══════════════════════════════════════════════════════════════
const GROUPS = []; // { title, startLine (1-based, banner start) }
let currentGroup = null;
let i = PLUGIN_START;
while (i < lines.length) {
  const l = lines[i] ?? '';
  const isBanner = /^ {2}\/\/ ═{3,}$/.test(l);
  const isTitleLine = /^ {2}\/\/\s{1,}(.+?)\s*$/.test(lines[i + 1] ?? '');
  const nextIsBanner = /^ {2}\/\/ ═{3,}$/.test(lines[i + 1] ?? '');
  if (isBanner && isTitleLine && !nextIsBanner) {
    // OPENING banner (banner + title + banner): finalize previous, start new.
    if (currentGroup) GROUPS.push(currentGroup);
    const title = (lines[i + 1] ?? '').match(/^ {2}\/\/\s{1,}(.+?)\s*$/);
    currentGroup = { title: title[1].trim(), start: i + 1 };
    i += 3; // skip opening banner + title + closing banner
    continue;
  }
  if (isBanner && !isTitleLine && currentGroup) {
    // CLOSING banner (banner + non-title) with an in-flight group.
    GROUPS.push(currentGroup);
    currentGroup = null;
  }
  i++;
}
// Flush the last in-flight group if the file ends inside one.
if (currentGroup) GROUPS.push(currentGroup);
// Group end = line before the next group's banner (minus the banner)
for (let g = 0; g < GROUPS.length; g++) {
  const next = GROUPS[g + 1];
  // end = line of the group's last route closing `});`
  // (2 lines before the next group's opening banner: blank + closing)
  GROUPS[g].end = next ? next.start - 2 : lines.length - 1; // last group: drop trailing `};`
}

function moduleFor(title) {
  const t = title.toLowerCase();
  if (t.includes('payment account')) return 'checkout-payment-account';
  if (t.includes('order creation')) return 'checkout-flow';
  if (t.includes('webhook')) return 'checkout-webhook';
  if (t.includes('order management')) return 'checkout-orders';
  if (t.includes('retailer status') || t.includes('retailer-status')) return 'checkout-retailer-status';
  return 'checkout-misc';
}

// ─── 3. Slice into modules ─────────────────────────────────────────
const modules = new Map();
const rawBodyParser = lines
  .slice(PLUGIN_START + 1, GROUPS[0].start - 1) // between plugin open and first banner
  .join('\n')
  .trim();
// The comment lines above the parser belong INSIDE the plugin body, not before
// the `export const` — split them off so they can be injected after it.
const rawBodyParserComment = (rawBodyParser.match(/^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*/) ?? [''])[0];
const rawBodyParserCode = rawBodyParser.slice(rawBodyParserComment.length);

for (const g of GROUPS) {
  g.module = moduleFor(g.title);
  let chunk = lines.slice(g.start - 1, g.end);
  // Trim trailing whitespace lines
  while (chunk.length && chunk[chunk.length - 1]?.trim() === '') chunk.pop();
  // Last group: drop the original plugin's closing `};`
  if (g === GROUPS[GROUPS.length - 1] && chunk[chunk.length - 1]?.trim() === '};') {
    chunk.pop();
  }
  if (!modules.has(g.module)) modules.set(g.module, []);
  modules.get(g.module).push(...chunk);
  console.log(`Section: ${g.title} -> ${g.module} (lines ${g.start}-${g.end})`);
}

// ─── 4. Write module files ─────────────────────────────────────────
const ident = (name) =>
  name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9_$]/g, '');

for (const [name, bodyLines] of modules) {
  const id = ident(name);
  let body = bodyLines.join('\n');
  let imports = pruneImports(body, allImports)
    // Drop FastifyPluginAsync from the fastify import — the template type
    // import already adds it. Keep any other fastify identifiers (FastifyRequest).
    .map((imp) =>
      imp
        .replace(
          /^import\s+type\s+\{[^}]*?FastifyPluginAsync\s*,\s*([^}]*?)\}\s+from\s+['"]fastify['"];?$/,
          'import type { $1 } from \'fastify\';',
        )
        .replace(
          /^import\s+type\s+\{\s*FastifyPluginAsync\s*\}\s+from\s+['"]fastify['"];?$/,
          '',
        )
        .replaceAll("from '../plugins/", "from '../../plugins/")
        .replaceAll("from '../index.js'", "from '../../index.js'")
        .replaceAll("from '../lib/", "from '../../lib/"),
    )
    .filter((imp) => imp.trim() !== '');
  // Only import the helpers this module actually references.
  const ALL_HELPERS = [
    'computeGst',
    'ConnectPaymentAccountSchema',
    'CreateOrderSchema',
    'generateGstInvoiceNumber',
    'razorpayAsRetailer',
    'RazorpayOrder',
    'UpdateOrderStatusSchema',
    'verifyRetailerWebhookSignature',
  ];
  const usedHelpers = ALL_HELPERS.filter((h) => new RegExp(`\\b${h}\\b`).test(body));
  const helpersImport =
    usedHelpers.length > 0
      ? `import {\n  ${usedHelpers.join(',\n  ')},\n} from './checkout-helpers.js';`
      : '';
  // Ensure type imports are present
  const typeLine = 'import type { FastifyPluginAsync } from \'fastify\';';
  const content = `// Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
${typeLine}
${imports.join('\n')}${helpersImport ? '\n' + helpersImport : ''}

export const ${id}Routes: FastifyPluginAsync = async (server) => {
${name === 'checkout-webhook' ? rawBodyParserComment + '  ' + rawBodyParserCode.trim() + '\n\n' : ''}${body}
};
`;
  writeFileSync(`${OUT_DIR}/${name}.ts`, content);
  console.log(`Wrote checkout/${name}.ts (${bodyLines.length} lines)`);
}

// ─── 5. Rewrite checkout.ts as aggregator ─────────────────────────
const registrations = [...modules.keys()]
  .map((name) => `  // ${name} — auto-split module\n  await server.register(${ident(name)}Routes);`)
  .join('\n');

const newCheckout = `// Checkout routes aggregator — shared helpers in checkout/checkout-helpers.ts,
// domain modules in ./checkout/. Auto-split via scripts/split-checkout-routes.mjs.
import type { FastifyPluginAsync } from 'fastify';
import { ${[...modules.keys()].map((n) => `${ident(n)}Routes`).join(', ')} } from './checkout/index.js';

export const checkoutRoutes: FastifyPluginAsync = async (server) => {
${registrations}
};
`;
writeFileSync(file, newCheckout);
console.log('Rewrote checkout.ts aggregator.');

// Barrel
const barrel = `// Barrel — re-exports the auto-split checkout domain modules.
${[...modules.keys()].map((n) => `export { ${ident(n)}Routes } from './${n}.js';`).join('\n')}
`;
writeFileSync(`${OUT_DIR}/index.ts`, barrel);
console.log('Wrote checkout/index.ts barrel.');
