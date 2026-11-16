// ─── GST Computation for Subscription Billing ──────────────────────
// SAC 998314 (Information technology software services / SaaS)
// Flat 18% GST rate. All amounts in paise (integers).
//
// Rules:
//   - Always compute from base, never divide gross by 1.18 (float drift).
//   - Rounding: Math.round to nearest paise; CGST/SGST split remainder
//     goes to SGST so cgst + sgst === gstTotal exactly.
//   - buyerStateCode unknown → inter-state → IGST (safer default).

export const GST_RATE = 0.18;
export const SAC_CODE = '998314';

export interface GstBreakdown {
  basePaise: number;
  gstTotal: number;
  gross: number;
  cgst: number;
  sgst: number;
  igst: number;
  rate: number;
  sac: string;
}

/**
 * Compute the GST split for a subscription charge.
 *
 * @param basePaise - Base price in paise (ex-GST)
 * @param buyerStateCode - Buyer's state code (e.g. "27" for Maharashtra).
 *                         Null/undefined → inter-state (IGST).
 * @param sellerStateCode - Seller's (Kanchuki's) registered state code.
 *                          Null/undefined → inter-state (IGST).
 * @returns GstBreakdown with all tax components in paise.
 */
/**
 * Split a GST-INCLUSIVE gross (add-on packs: the admin enters the all-in price)
 * into base + GST. base = round(gross * 100 / 118); GST is the remainder, so
 * base + gst === gross exactly (the invoice must reconcile to what Razorpay
 * charged). Reuses computeSubscriptionGst for the CGST/SGST/IGST split.
 */
export function computeInclusiveGst({
  grossPaise,
  buyerStateCode,
  sellerStateCode,
}: {
  grossPaise: number;
  buyerStateCode?: string | null;
  sellerStateCode?: string | null;
}): GstBreakdown {
  const basePaise = Math.round((grossPaise * 100) / (100 + GST_RATE * 100));
  const split = computeSubscriptionGst({ basePaise, buyerStateCode, sellerStateCode });
  const gstTotal = grossPaise - basePaise;
  if (gstTotal === split.gstTotal) return split;
  // 1-paise rounding drift: the remainder goes to GST so the invoice sums to the charge.
  if (split.igst > 0) return { ...split, gstTotal, gross: grossPaise, igst: gstTotal };
  const cgst = Math.floor(gstTotal / 2);
  return { ...split, gstTotal, gross: grossPaise, cgst, sgst: gstTotal - cgst };
}

export function computeSubscriptionGst({
  basePaise,
  buyerStateCode,
  sellerStateCode,
}: {
  basePaise: number;
  buyerStateCode?: string | null;
  sellerStateCode?: string | null;
}): GstBreakdown {
  const gstTotal = Math.round(basePaise * GST_RATE);
  const gross = basePaise + gstTotal;

  // Intra-state: CGST + SGST (each half of GST total)
  // Inter-state: IGST (full GST amount)
  // Unknown state codes → treat as inter-state (safer default)
  const isIntraState =
    buyerStateCode != null && sellerStateCode != null && buyerStateCode === sellerStateCode;

  if (isIntraState) {
    const cgst = Math.floor(gstTotal / 2);
    const sgst = gstTotal - cgst; // remainder goes to SGST
    return { basePaise, gstTotal, gross, cgst, sgst, igst: 0, rate: GST_RATE, sac: SAC_CODE };
  }

  return {
    basePaise,
    gstTotal,
    gross,
    cgst: 0,
    sgst: 0,
    igst: gstTotal,
    rate: GST_RATE,
    sac: SAC_CODE,
  };
}
