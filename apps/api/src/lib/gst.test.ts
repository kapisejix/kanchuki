import { describe, expect, it } from 'vitest';
import { GST_RATE, SAC_CODE, computeSubscriptionGst } from './gst.js';

describe('computeSubscriptionGst', () => {
  // Worked example from spec: base ₹4,999 = 499900 paise, intra-state
  it('intra-state: splits GST into CGST + SGST', () => {
    const result = computeSubscriptionGst({
      basePaise: 499900,
      buyerStateCode: '27', // Maharashtra
      sellerStateCode: '27',
    });

    expect(result.basePaise).toBe(499900);
    expect(result.gstTotal).toBe(Math.round(499900 * 0.18)); // 89982
    expect(result.gross).toBe(499900 + 89982); // 589882
    expect(result.cgst).toBe(Math.floor(89982 / 2)); // 44991
    expect(result.sgst).toBe(89982 - 44991); // 44991
    expect(result.igst).toBe(0);
    expect(result.cgst + result.sgst).toBe(result.gstTotal);
    expect(result.rate).toBe(GST_RATE);
    expect(result.sac).toBe(SAC_CODE);
  });

  // Inter-state: different states
  it('inter-state: full IGST, no CGST/SGST', () => {
    const result = computeSubscriptionGst({
      basePaise: 499900,
      buyerStateCode: '06', // Haryana
      sellerStateCode: '27', // Maharashtra
    });

    expect(result.basePaise).toBe(499900);
    expect(result.gstTotal).toBe(Math.round(499900 * 0.18));
    expect(result.gross).toBe(499900 + result.gstTotal);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(result.gstTotal);
  });

  // Unknown buyer state → inter-state (safer default)
  it('unknown buyer state → IGST (inter-state default)', () => {
    const result = computeSubscriptionGst({
      basePaise: 499900,
      buyerStateCode: null,
      sellerStateCode: '27',
    });

    expect(result.igst).toBe(result.gstTotal);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  // Unknown seller state → inter-state
  it('unknown seller state → IGST', () => {
    const result = computeSubscriptionGst({
      basePaise: 499900,
      buyerStateCode: '27',
      sellerStateCode: null,
    });

    expect(result.igst).toBe(result.gstTotal);
  });

  // Both unknown → inter-state
  it('both states unknown → IGST', () => {
    const result = computeSubscriptionGst({
      basePaise: 499900,
    });

    expect(result.igst).toBe(result.gstTotal);
  });

  // Rounding: odd GST total → SGST gets the extra paise
  it('rounding remainder goes to SGST for intra-state', () => {
    // base 101 paise → gst = round(101 * 0.18) = round(18.18) = 18
    const result = computeSubscriptionGst({
      basePaise: 101,
      buyerStateCode: '27',
      sellerStateCode: '27',
    });

    expect(result.gstTotal).toBe(18);
    expect(result.cgst + result.sgst).toBe(18);
    // 18 / 2 = 9.0 → cgst=9, sgst=9
    expect(result.cgst).toBe(9);
    expect(result.sgst).toBe(9);
  });

  // Odd GST total (e.g., 19 paise GST)
  it('odd GST total: SGST = gstTotal - cgst', () => {
    // base ~106 paise → gst = round(106 * 0.18) = round(19.08) = 19
    const result = computeSubscriptionGst({
      basePaise: 106,
      buyerStateCode: '06',
      sellerStateCode: '06',
    });

    expect(result.gstTotal).toBe(19);
    expect(result.cgst).toBe(Math.floor(19 / 2)); // 9
    expect(result.sgst).toBe(19 - 9); // 10
    expect(result.cgst + result.sgst).toBe(19);
  });

  // Zero base
  it('zero base → zero GST', () => {
    const result = computeSubscriptionGst({ basePaise: 0 });
    expect(result.gstTotal).toBe(0);
    expect(result.gross).toBe(0);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(0);
  });

  // Large amount: Growth plan
  it('Growth plan ₹9,999 intra-state', () => {
    const result = computeSubscriptionGst({
      basePaise: 999900,
      buyerStateCode: '27',
      sellerStateCode: '27',
    });

    expect(result.gstTotal).toBe(Math.round(999900 * 0.18)); // 179982
    expect(result.gross).toBe(999900 + 179982); // 1179882
    expect(result.cgst + result.sgst).toBe(179982);
    expect(result.igst).toBe(0);
  });

  // Large amount: Pro plan inter-state
  it('Pro plan ₹14,999 inter-state', () => {
    const result = computeSubscriptionGst({
      basePaise: 1499900,
      buyerStateCode: '06',
      sellerStateCode: '27',
    });

    expect(result.gstTotal).toBe(Math.round(1499900 * 0.18)); // 269982
    expect(result.igst).toBe(269982);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });
});
