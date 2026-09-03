'use client';

import { MessageCircle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

interface Props {
  /** Opens the customer lead/consent modal — the primary "Enquire Now" action. */
  onEnquire: () => void;
  /** When set, "View Full Catalog" renders as a Link to this URL. */
  catalogHref?: string;
  /** When set (and catalogHref is not), "View Full Catalog" renders as a button. */
  onViewCatalog?: () => void;
  /** Sold products hide the whole CTA block (a sold banner replaces it). */
  isSold?: boolean;
}

/**
 * Shared dual-CTA block — the exact button design used on the shared
 * single-product page (gradient Enquire Now + outline View Full Catalog,
 * side by side). Rendered by both SharedProductPage and the in-catalog
 * ProductDetailSheet so the two surfaces stay visually identical (#11).
 */
export function ProductCtas({ onEnquire, catalogHref, onViewCatalog, isSold = false }: Props) {
  if (isSold) return null;

  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <button
        type="button"
        onClick={onEnquire}
        className="w-full py-3.5 px-3 rounded-3xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white flex items-center justify-center gap-2 shadow-lg shadow-[#231F48]/25 hover:shadow-xl transition-all active:scale-[0.98]"
      >
        <MessageCircle size={16} className="fill-current text-emerald-400 shrink-0" />
        <span className="text-xs font-extrabold text-white uppercase tracking-wider">Enquire Now</span>
      </button>

      {catalogHref ? (
        <Link
          href={catalogHref}
          prefetch
          className="flex items-center justify-center gap-2 w-full font-bold py-3.5 rounded-3xl bg-white border border-[#E0E1F6] text-[#231F48] shadow-sm hover:border-[#BB3F95] transition text-xs uppercase tracking-wider"
        >
          <ShoppingBag size={16} className="shrink-0" />
          View Full Catalog
        </Link>
      ) : onViewCatalog ? (
        <button
          type="button"
          onClick={onViewCatalog}
          className="flex items-center justify-center gap-2 w-full font-bold py-3.5 rounded-3xl bg-white border border-[#E0E1F6] text-[#231F48] shadow-sm hover:border-[#BB3F95] transition text-xs uppercase tracking-wider"
        >
          <ShoppingBag size={16} className="shrink-0" />
          View Full Catalog
        </button>
      ) : null}
    </div>
  );
}