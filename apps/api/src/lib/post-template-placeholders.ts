// post-template-placeholders.ts — server-owned placeholder resolution for
// admin post templates (Create Post Composer v2 §11.2, T-9.5).
//
// Templates store {placeholders} such as "{product_name}" or "₹{price}". The
// mobile composer shows a best-effort client preview, but the AUTHORITATIVE
// resolution happens server-side here at publish/send time — the same rule
// as R-11 (never trust client URLs/text).
//
// Supported tokens:
//   {product_name}  — single product name
//   {product_names} — carousel list ("A, B, C +2 more", capped at 3 shown)
//   {price}         — bare en-IN grouped amount ("1,499") WITHOUT ₹ so the
//                     template controls the symbol ("₹{price}", "{price} only")
//   {category}      — product category label
//   {link}          — resolved collection/storefront/product URL
//   {store_name}    — retailer.shop_name
//   {festival}      — campaign/festival context name
//
// Fail-open: a token with no value resolves to "" (never blocks publishing)
// and any leftover {typo} tokens are dropped too, so a live post never shows
// a raw placeholder. Runs of 2+ literal spaces left behind by removals are
// collapsed; line breaks are preserved.

const SHOWN_NAME_CAP = 3;

export interface PostTemplateContext {
  productName?: string | null;
  /** Carousel item names — each resolved via its own product row. */
  productNames?: Array<string | null | undefined>;
  /** Product price in paise (schema stores paise). */
  pricePaise?: number | null;
  category?: string | null;
  link?: string | null;
  storeName?: string | null;
  festival?: string | null;
}

function formatBarePrice(paise: number): string {
  const rupees = paise / 100;
  const isWhole = Number.isInteger(rupees);
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

function resolveValues(ctx: PostTemplateContext): Record<string, string> {
  const names = (ctx.productNames ?? []).filter((n): n is string => Boolean(n?.trim()));
  const shown = names.slice(0, SHOWN_NAME_CAP);
  const more = names.length - shown.length;
  const productNames = shown.join(', ') + (more > 0 ? ` +${more} more` : '');

  return {
    product_name: ctx.productName?.trim() ?? names[0] ?? '',
    product_names: productNames,
    price: ctx.pricePaise != null ? formatBarePrice(ctx.pricePaise) : '',
    category: ctx.category?.trim() ?? '',
    link: ctx.link?.trim() ?? '',
    store_name: ctx.storeName?.trim() ?? '',
    festival: ctx.festival?.trim() ?? '',
  };
}

const KNOWN_TOKEN = /\{(product_name|product_names|price|category|link|store_name|festival)\}/g;
const ANY_TOKEN = /\{[a-z0-9_]+\}/gi;

/**
 * Resolve {placeholders} in a post-template caption against the given
 * context. Never throws; never leaves a raw token in the output.
 */
export function resolvePostTemplate(
  template: string,
  ctx: PostTemplateContext = {},
): string {
  const values = resolveValues(ctx);
  const substituted = template.replace(KNOWN_TOKEN, (match, key: string) => values[key] ?? '');
  const noUnknownTokens = substituted.replace(ANY_TOKEN, '');
  return noUnknownTokens.replace(/ {2,}/g, ' ').trim();
}