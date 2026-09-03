// ─── GST Invoice PDF Builder ───────────────────────────────────────
// Generates a GST-compliant tax invoice using pdfkit.
// Layout: seller block → buyer block → invoice meta → line items →
//         CGST/SGST or IGST rows → total in figures + words →
//         "Reverse charge: No" → place of supply.

import PDFDocument from 'pdfkit';

export interface InvoicePdfInput {
  // Seller (Kanchuki)
  seller: {
    name: string;
    gstin: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
  };
  // Buyer (Retailer)
  buyer: {
    name: string;
    gstin: string | null; // null → "Unregistered"
    address: string | null;
    city: string | null;
    state: string | null;
  };
  // Invoice meta
  invoiceNumber: string; // e.g. KAN/26-27/000123
  invoiceDate: string; // e.g. "01 Sep 2026"
  // Line item
  planName: string; // e.g. "Kanchuki Growth Plan"
  sacCode: string; // e.g. "998314"
  description: string; // e.g. "Monthly SaaS subscription"
  // Amounts (all in paise)
  basePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  gstTotalPaise: number;
  grossPaise: number;
  gstRate: number; // 0.18
  placeOfSupply: string | null;
}

/** Convert paise to ₹ display string. */
function paiseToRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Indian number-to-words for the total line. Handles up to ₹99,99,999.99 */
function numberToWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const paisa = paise % 100;

  if (rupees === 0 && paisa === 0) return 'Zero';

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  function convertGroup(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n]!;
    if (n < 100) return tens[Math.floor(n / 10)]! + (n % 10 ? ' ' + ones[n % 10] : '');
    return (
      ones[Math.floor(n / 100)]! + ' Hundred' + (n % 100 ? ' and ' + convertGroup(n % 100) : '')
    );
  }

  let result = '';
  if (rupees >= 10000000) {
    result += convertGroup(Math.floor(rupees / 10000000)) + ' Crore ';
  }
  if (rupees >= 100000) {
    result += convertGroup(Math.floor((rupees % 10000000) / 100000)) + ' Lakh ';
  }
  if (rupees >= 1000) {
    result += convertGroup(Math.floor((rupees % 100000) / 1000)) + ' Thousand ';
  }
  if (rupees >= 100) {
    result += convertGroup(Math.floor((rupees % 1000) / 100)) + ' Hundred ';
  }
  if (rupees % 100 > 0) {
    result += convertGroup(rupees % 100);
  }
  result = result.trim() + ' Rupees';
  if (paisa > 0) {
    result += ' and ' + convertGroup(paisa) + ' Paise';
  }
  result += ' Only';
  return result;
}

/**
 * Generate a GST-compliant invoice PDF buffer.
 */
export async function buildGstInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // minus margins
    const left = 50;
    const right = left + pageWidth;

    // ─── Header ───────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', left, 50, { align: 'center' });
    doc.moveDown(0.5);

    // ─── Seller Block ─────────────────────────────────────────
    doc.fontSize(9).font('Helvetica-Bold').text('From:', left);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(input.seller.name, left)
      .text(`GSTIN: ${input.seller.gstin}`, left)
      .text(input.seller.address, left)
      .text(`${input.seller.city}, ${input.seller.state} - ${input.seller.stateCode}`, left);
    doc.moveDown(0.5);

    // ─── Buyer Block ──────────────────────────────────────────
    doc.font('Helvetica-Bold').text('To:', left);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(input.buyer.name, left)
      .text(`GSTIN: ${input.buyer.gstin ?? 'Unregistered'}`, left);
    if (input.buyer.address) doc.text(input.buyer.address, left);
    if (input.buyer.city && input.buyer.state) {
      doc.text(`${input.buyer.city}, ${input.buyer.state}`, left);
    }
    doc.moveDown(0.5);

    // ─── Invoice Meta ─────────────────────────────────────────
    // `continued: true` keeps the value on the same line as its label
    // instead of pdfkit advancing doc.y after each .text() call.
    doc.fontSize(9);
    doc.font('Helvetica-Bold').text('Invoice No: ', left, undefined, { continued: true });
    doc.font('Helvetica').text(input.invoiceNumber);
    doc.font('Helvetica-Bold').text('Date: ', left, undefined, { continued: true });
    doc.font('Helvetica').text(input.invoiceDate);
    doc.font('Helvetica-Bold').text('Place of Supply: ', left, undefined, { continued: true });
    doc.font('Helvetica').text(input.placeOfSupply ?? 'N/A');
    doc.moveDown(1);

    // ─── Line Items Table ─────────────────────────────────────
    const tableTop = doc.y;
    const col1 = left;
    const col2 = left + 30;
    const col3 = left + 250;
    const col4 = right - 80;

    // Header
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('S.No', col1, tableTop, { width: 25 })
      .text('Description', col2, tableTop, { width: 200 })
      .text('SAC', col3, tableTop, { width: 60 })
      .text('Amount', col4, tableTop, { width: 80, align: 'right' });

    doc
      .moveTo(left, tableTop + 12)
      .lineTo(right, tableTop + 12)
      .stroke();
    doc.moveDown(0.3);

    // Row
    const rowY = tableTop + 18;
    doc
      .font('Helvetica')
      .fontSize(9)
      .text('1', col1, rowY, { width: 25 })
      .text(`${input.planName} — ${input.description}`, col2, rowY, { width: 200 })
      .text(input.sacCode, col3, rowY, { width: 60 })
      .text(paiseToRupees(input.basePaise), col4, rowY, { width: 80, align: 'right' });

    doc
      .moveTo(left, rowY + 14)
      .lineTo(right, rowY + 14)
      .stroke();
    doc.moveDown(1);

    // ─── Tax Rows ─────────────────────────────────────────────
    const isInterState = input.igstPaise > 0;
    const taxLabel = isInterState ? 'IGST' : 'CGST + SGST';

    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`Tax (${taxLabel} @ ${(input.gstRate * 100).toFixed(0)}%):`, left);

    if (isInterState) {
      doc.text(
        `  IGST @ ${(input.gstRate * 100).toFixed(0)}%: ${paiseToRupees(input.igstPaise)}`,
        left,
      );
    } else {
      doc.text(
        `  CGST @ ${(input.gstRate * 50).toFixed(0)}%: ${paiseToRupees(input.cgstPaise)}`,
        left,
      );
      doc.text(
        `  SGST @ ${(input.gstRate * 50).toFixed(0)}%: ${paiseToRupees(input.sgstPaise)}`,
        left,
      );
    }
    doc.moveDown(0.5);

    // ─── Total ────────────────────────────────────────────────
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.3);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`Total: ${paiseToRupees(input.grossPaise)}`, left, doc.y, { align: 'right' });
    doc.moveDown(0.3);

    // Amount in words
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(`Amount in words: ${numberToWords(input.grossPaise)}`, left);
    doc.moveDown(1);

    // ─── Footer ───────────────────────────────────────────────
    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Reverse charge: No', left)
      .text(`Place of supply: ${input.placeOfSupply ?? 'N/A'}`, left)
      .moveDown(1)
      .text('This is a computer-generated invoice.', left, doc.y, { align: 'center' });

    doc.end();
  });
}
