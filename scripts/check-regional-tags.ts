// Read-only check for board §6.9: does any live product actually carry the
// regional weave/style tags that `RegionalFilters.tsx` filtered on?
//
// WHY THIS EXISTS
//
// The board asks for this before deciding the component's fate: "Check first
// whether any product carries these tags. None → delete the component. Some →
// default_product_attributes." A separate grep already answered a stronger
// question — the component is declared in CollectionView.tsx:48 but never
// rendered, so it is unreachable regardless of the data — and this script
// answers the remaining one: whether the *capability* has data behind it. Those
// two answers lead to different follow-ups (delete and forget, vs. rebuild the
// feature from the DB), so the count is still worth having.
//
// Same shape as check-pending-migrations.ts: SELECTs only, prints the DB
// hostname and never the credentials, and writes nothing. Safe against prod.
//
// Run from apps/api (so @prisma/client resolves):
//   cd apps/api && npx tsx --env-file .env ../../scripts/check-regional-tags.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Verbatim from apps/web/src/app/c/[slug]/components/RegionalFilters.tsx
// (`REGIONAL_STYLES`). Deliberately duplicated rather than imported: the whole
// question is whether this list should survive, and importing it would make the
// script fail the moment the component is deleted.
const KEYS: Array<{ key: string; label: string }> = [
  { key: 'banarasi', label: 'Banarasi' },
  { key: 'kanjeevaram', label: 'Kanjeevaram' },
  { key: 'chanderi', label: 'Chanderi' },
  { key: 'bandhani', label: 'Bandhani' },
  { key: 'chikankari', label: 'Chikankari' },
  { key: 'phulkari', label: 'Phulkari' },
  { key: 'ikat', label: 'Ikat' },
  { key: 'paithani', label: 'Paithani' },
  { key: 'pochampally', label: 'Pochampally' },
  { key: 'block_print', label: 'Block Print' },
  { key: 'zari', label: 'Zari Work' },
  { key: 'embroidered', label: 'Embroidered' },
];

// Every free-text column a retailer or the AI tagger can put a weave name into,
// plus the tag arrays. Named one by one rather than casting the whole row to
// text: `products.id` is a cuid, and a random cuid containing "ikat" would
// report a match that no human ever typed.
const TEXT_COLUMNS = [
  'name',
  'description',
  'category',
  'subtype',
  'product_type',
  'primary_color',
  'fabric_estimate',
  'pattern',
  'notes',
] as const;

const ARRAY_COLUMNS = [
  'search_tags',
  'styles',
  'fabrics',
  'embellishments',
  'occasions',
  'secondary_colors',
] as const;

const MATCH_CLAUSE = [
  ...TEXT_COLUMNS.map((c) => `p.${c} ILIKE ANY($1::text[])`),
  ...ARRAY_COLUMNS.map((c) => `array_to_string(p.${c}, ' ') ILIKE ANY($1::text[])`),
].join('\n        OR ');

/** Both spellings, because the key is snake_case and the label is not. */
function patternsFor(key: string, label: string): string[] {
  return [...new Set([key, label.toLowerCase(), key.replace(/_/g, ' ')])].map((s) => `%${s}%`);
}

type CountRow = { n: number };
type SampleRow = { id: string; name: string | null; shop_name: string };

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log(`[check-regional-tags] db=${url.match(/@([^:/]+)/)?.[1] ?? 'unknown'} (read-only)`);

  const total = await prisma.$queryRawUnsafe<CountRow[]>(
    `SELECT count(*)::int AS n FROM products p
      JOIN retailers r ON r.id = p.retailer_id
      WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL`,
  );
  console.log(`[check-regional-tags] live products (store not deleted): ${total[0]?.n ?? 0}\n`);

  let keysWithData = 0;

  for (const { key, label } of KEYS) {
    const patterns = patternsFor(key, label);
    const count = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*)::int AS n FROM products p
        JOIN retailers r ON r.id = p.retailer_id
        WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL
          AND (${MATCH_CLAUSE})`,
      patterns,
    );
    const n = count[0]?.n ?? 0;
    if (n > 0) keysWithData += 1;
    console.log(`  ${String(n).padStart(6)}  ${key.padEnd(14)} (${label})`);

    if (n > 0) {
      const samples = await prisma.$queryRawUnsafe<SampleRow[]>(
        `SELECT p.id, p.name, r.shop_name FROM products p
          JOIN retailers r ON r.id = p.retailer_id
          WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL
            AND (${MATCH_CLAUSE})
          ORDER BY p.created_at DESC LIMIT 4`,
        patterns,
      );
      for (const s of samples) {
        console.log(`          e.g. ${s.shop_name} — ${s.name ?? '(unnamed)'} [${s.id}]`);
      }
    }
  }

  console.log('');
  if (keysWithData === 0) {
    console.log(
      '[check-regional-tags] VERDICT: no live product matches any of the 12 keys — the\n' +
        '  feature is data-empty as well as unreachable. Nothing to migrate; the DB-sourced\n' +
        '  rebuild would have nothing to show either.',
    );
  } else {
    console.log(
      `[check-regional-tags] VERDICT: ${keysWithData}/${KEYS.length} keys match live products, so the\n` +
        '  capability has data behind it. If regional filtering should exist, rebuild it from\n' +
        '  default_product_attributes (kind = STYLE) rather than reviving the hardcoded list.',
    );
  }
}

main()
  .catch((err) => {
    console.error('[check-regional-tags] ERROR:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
