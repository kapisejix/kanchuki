import { FREE_SIZE } from '@kanchuki/shared';
import type { ProductStockRow, ProductSummary } from '@kanchuki/shared';
import type { SellLineResult } from './api';

/** What the list endpoint returns per product (it includes `stock`, the shared type omits it). */
export type SellProduct = Pick<
  ProductSummary,
  'id' | 'name' | 'sku' | 'price_min' | 'status' | 'primary_photo_url'
> & { stock?: ProductStockRow[] };

export interface BillLine {
  key: string;
  sku: string;
  /** null = SKU not in this catalog. */
  product: SellProduct | null;
  /** null = several sizes in stock, retailer has not chosen yet. */
  size: string | null;
  qty: number;
}

export interface BillState {
  lines: BillLine[];
}

export const emptyBill: BillState = { lines: [] };

/** POST /v1/products/sell accepts at most 100 lines per request. */
export const MAX_BILL_LINES = 100;

/** Idempotency key for one bill. Hermes has no guaranteed crypto.randomUUID, so a v4-shaped
 * random id (matches the server's [A-Za-z0-9_-]{1,64}) is enough: it only has to tell bills apart. */
export function newBillId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type BillAction =
  | { type: 'add'; sku: string; product: SellProduct | null }
  | { type: 'setSize'; key: string; size: string }
  | { type: 'inc'; key: string }
  | { type: 'dec'; key: string }
  | { type: 'remove'; key: string }
  | { type: 'reset' };

export type LineState = 'ok' | 'needs_size' | 'sold_out' | 'not_found';

const rows = (p: SellProduct) => p.stock ?? [];
const tracked = (p: SellProduct) => rows(p).length > 0;

/** Sizes with at least one unit, in stock order. Untracked products sell as FREE. */
export function inStockSizes(p: SellProduct): string[] {
  if (p.status === 'SOLD') return [];
  if (!tracked(p)) return [FREE_SIZE];
  return rows(p)
    .filter((r) => r.quantity > 0)
    .map((r) => r.size);
}

/** Units available for a size. Untracked products allow exactly one (sale marks the design SOLD). */
export function stockFor(p: SellProduct, size: string): number {
  if (p.status === 'SOLD') return 0;
  if (!tracked(p)) return 1;
  return rows(p).find((r) => r.size === size)?.quantity ?? 0;
}

export function lineState(l: BillLine): LineState {
  if (!l.product) return 'not_found';
  if (inStockSizes(l.product).length === 0) return 'sold_out';
  return l.size === null ? 'needs_size' : 'ok';
}

const keyOf = (productId: string, size: string | null) => `${productId}:${size ?? '?'}`;

function addLine(state: BillState, sku: string, product: SellProduct | null): BillState {
  if (!product) {
    const key = `missing:${sku}`;
    if (state.lines.some((l) => l.key === key)) return state;
    return { lines: [...state.lines, { key, sku, product: null, size: null, qty: 1 }] };
  }
  const sizes = inStockSizes(product);
  if (sizes.length === 0) {
    const key = `sold:${product.id}`;
    if (state.lines.some((l) => l.key === key)) return state;
    return { lines: [...state.lines, { key, sku, product, size: null, qty: 1 }] };
  }
  const size = sizes.length === 1 ? (sizes[0] ?? null) : null;
  const key = keyOf(product.id, size);
  const existing = state.lines.find((l) => l.key === key);
  if (existing) {
    // Unresolved: one chooser at a time. Resolved: one more unit, capped at stock.
    if (size === null || existing.qty >= stockFor(product, size)) return state;
    return {
      lines: state.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)),
    };
  }
  return { lines: [...state.lines, { key, sku, product, size, qty: 1 }] };
}

export function billReducer(state: BillState, action: BillAction): BillState {
  switch (action.type) {
    case 'add': {
      const next = addLine(state, action.sku, action.product);
      // A new row past the server cap would make the whole bill 422; keep the old bill.
      return next.lines.length > MAX_BILL_LINES ? state : next;
    }
    case 'setSize': {
      const line = state.lines.find((l) => l.key === action.key);
      if (!line?.product) return state;
      const cap = stockFor(line.product, action.size);
      if (cap < 1) return state;
      const key = keyOf(line.product.id, action.size);
      const twin = state.lines.find((l) => l.key === key && l !== line);
      const qty = Math.min(cap, line.qty + (twin?.qty ?? 0));
      const merged = { ...line, key, size: action.size, qty };
      return {
        lines: state.lines.flatMap((l) => (l === line ? [merged] : l === twin ? [] : [l])),
      };
    }
    case 'inc':
      return {
        lines: state.lines.map((l) =>
          l.key === action.key &&
          l.product &&
          l.size !== null &&
          l.qty < stockFor(l.product, l.size)
            ? { ...l, qty: l.qty + 1 }
            : l,
        ),
      };
    case 'dec':
      return {
        lines: state.lines.map((l) =>
          l.key === action.key && l.qty > 1 ? { ...l, qty: l.qty - 1 } : l,
        ),
      };
    case 'remove':
      return { lines: state.lines.filter((l) => l.key !== action.key) };
    case 'reset':
      return emptyBill;
  }
}

const sellable = (s: BillState) =>
  s.lines.filter((l) => ['ok', 'needs_size'].includes(lineState(l)));

/** At least one sellable row and none still waiting on a size. Bad rows never block. */
export function canConfirm(s: BillState): boolean {
  const rowsToSell = sellable(s);
  return rowsToSell.length > 0 && rowsToSell.every((l) => lineState(l) === 'ok');
}

export function toSellLines(
  s: BillState,
): { product_id: string; size: string; quantity: number }[] {
  return s.lines.flatMap((l) =>
    lineState(l) === 'ok' && l.product && l.size
      ? [{ product_id: l.product.id, size: l.size, quantity: l.qty }]
      : [],
  );
}

export const LINE_ERRORS: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock',
  NOT_FOUND: 'Product not found',
  INVALID_SIZE: 'That size is no longer valid',
  BILL_UNDONE: 'This bill was undone',
  // The server sent no row for this line (a replay after a timeout only knows committed sales).
  NOT_APPLIED: 'Not sold: scan it again',
};

/**
 * Server rows for a bill plus a NOT_APPLIED row for every sent line it left out: a replay answers
 * only from committed sales, so a line that failed the first time has no row. Never let it vanish.
 */
export function settleSell(
  sent: { product_id: string; size: string }[],
  rows: SellLineResult[],
): SellLineResult[] {
  const missing: SellLineResult[] = sent
    .filter((s) => !rows.some((l) => l.product_id === s.product_id && l.size === s.size))
    .map((s) => ({ product_id: s.product_id, size: s.size, ok: false, error: 'NOT_APPLIED' }));
  return [...rows, ...missing];
}

/** One "Name: reason" line per failed row. `names` maps product_id to a display name. */
export function describeFailures(rows: SellLineResult[], names: Record<string, string>): string[] {
  return rows
    .filter((r) => !r.ok)
    .map(
      (r) =>
        `${names[r.product_id] ?? r.product_id}: ${LINE_ERRORS[r.error ?? ''] ?? 'Could not update'}`,
    );
}

/**
 * Offline SKU lookup: scan product lists the catalog screens already cached (plain `{data}` or
 * infinite `{pages:[{data}]}`). Only reads what is there, so a SKU the retailer never loaded is a miss.
 */
export function findInCachedLists(
  entries: [unknown, unknown][],
  rawSku: string,
): SellProduct | null {
  const sku = rawSku.trim().toUpperCase();
  for (const [, data] of entries) {
    const d = data as { data?: unknown; pages?: { data?: unknown }[] } | null | undefined;
    const lists = [d?.data, ...(Array.isArray(d?.pages) ? d.pages.map((p) => p?.data) : [])];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      const hit = list.find(
        (p) => typeof p?.sku === 'string' && p.sku.trim().toUpperCase() === sku,
      );
      if (hit) return hit as SellProduct;
    }
  }
  return null;
}

/** Informational total in paise (price is not editable in v1). */
export function billTotalPaise(s: BillState): number {
  return sellable(s).reduce((sum, l) => sum + (l.product?.price_min ?? 0) * l.qty, 0);
}
