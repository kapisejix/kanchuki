import { PDFDocument } from 'pdfkit';
import { uploadBuffer, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

/**
 * Generate a GST invoice PDF for an order and upload it to R2.
 * Updates the order with the PDF's R2 key and public URL.
 * @param orderId The order ID
 */
export async function generateAndAttachInvoicePdf(orderId: string): Promise<void> {
  // Fetch the order with necessary details
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      gst_invoice_number: true,
      gst_amount: true,
      subtotal_amount: true,
      total_amount: true,
      customer_name: true,
      customer_phone: true,
      shipping_address: true,
      items: {
        select: {
          product_name_snapshot: true,
          price_snapshot: true,
          quantity: true,
        },
      },
      retailer: {
        select: {
          shop_name: true,
          phone: true,
          address_line1: true,
          address_line2: true,
          city: true,
          state: true,
          pincode: true,
          gstin: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Create a new PDF document
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers: Buffer[] = [];

  doc.on('data', (chunk) => {
    buffers.push(chunk);
  });
  doc.on('end', () => {
    // This will be called when the PDF is finalized
  });

  // --- Invoice Header ---
  doc
    .fontSize(20)
    .text('TAX INVOICE', { align: 'center' })
    .moveDown();

  // --- Invoice Details ---
  doc
    .fontSize(10)
    .text(`Invoice No.: ${order.gst_invoice_number}`, { align: 'right' })
    .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
    .moveDown();

  // --- Seller (Retailer) Details ---
  doc
    .fontSize(12)
    .text('Seller:', { underline: true })
    .fontSize(10)
    .text(order.retailer.shop_name)
    .text(`Address: ${order.retailer.address_line1}, ${order.retailer.address_line2 || ''}, ${order.retailer.city}, ${order.retailer.state} - ${order.retailer.pincode}`)
    .text(`GSTIN: ${order.retailer.gstin}`)
    .text(`Phone: ${order.retailer.phone}`)
    .moveDown();

  // --- Buyer (Customer) Details ---
  doc
    .fontSize(12)
    .text('Buyer:', { underline: true })
    .fontSize(10)
    .text(order.customer_name)
    .text(`Address: ${order.shipping_address.line1}, ${order.shipping_address.line2 || ''}, ${order.shipping_address.city}, ${order.shipping_address.state} - ${order.shipping_address.pincode}`)
    .text(`Phone: ${order.customer_phone}`)
    .moveDown();

  // --- Invoice Table Header ---
  const tableTop = doc.y;
  doc
    .fontSize(10)
    .text('Description', 50, tableTop, { width: 200, align: 'left' })
    .text('HSN Code', 250, tableTop, { width: 80, align: 'center' })
    .text('Qty', 330, tableTop, { width: 40, align: 'center' })
    .text('Unit Price (₹)', 370, tableTop, { width: 80, align: 'right' })
    .text('Amount (₹)', 450, tableTop, { width: 80, align: 'right' })
    .moveDown(0.5)
    .rect(50, tableTop - 5, 480, 15)
    .stroke();

  // --- Invoice Table Rows ---
  let rowIndex = 0;
  let tableY = tableTop + 20;
  for (const item of order.items) {
    // Since we don't have HSN code in the order item snapshot, we'll leave it blank for now.
    // In the future, we can add HSN code to the product snapshot.
    const hsnCode = ''; // TODO: Fetch HSN code from product or retailer settings
    const unitPrice = (item.price_snapshot / 100).toFixed(2); // Convert paise to rupees
    const quantity = item.quantity;
    const amount = (item.price_snapshot * item.quantity) / 100; // Total in rupees

    doc
      .fontSize(9)
      .text(item.product_name_snapshot || '', 50, tableY, { width: 200, align: 'left' })
      .text(hsnCode, 250, tableY, { width: 80, align: 'center' })
      .text(quantity.toString(), 330, tableY, { width: 40, align: 'center' })
      .text(unitPrice, 370, tableY, { width: 80, align: 'right' })
      .text(amount.toFixed(2), 450, tableY, { width: 80, align: 'right' });

    tableY += 20;
    rowIndex++;
  }

  // --- Totals ---
  const totalsY = tableY + 20;
  doc
    .fontSize(10)
    .text('Subtotal:', 350, totalsY, { width: 100, align: 'right' })
    .text(`${(order.subtotal_amount / 100).toFixed(2)}`, 450, totalsY, { width: 80, align: 'right' })
    .text('GST:', 350, totalsY + 20, { width: 100, align: 'right' })
    .text(`${(order.gst_amount / 100).toFixed(2)}`, 450, totalsY + 20, { width: 80, align: 'right' })
    .text('Total Amount:', 350, totalsY + 40, { width: 100, align: 'right', bold: true })
    .text(`${(order.total_amount / 100).toFixed(2)}`, 450, totalsY + 40, { width: 80, align: 'right', bold: true });

  // --- Footer ---
  doc
    .fontSize(8)
    .text('This is a computer generated invoice and does not require signature.', 50, doc.page.height - 50, { align: 'center' })
    .moveDown();

  // Finalize the PDF
  doc.end();

  // Wait for the PDF to be generated
  const pdfBuffer = Buffer.concat(buffers);

  // Upload the PDF to R2
  const r2Key = `invoices/${order.id}-${Date.now()}.pdf`;
  await uploadBuffer(r2Key, pdfBuffer, 'application/pdf');

  // Update the order with the PDF's R2 key and public URL
  await prisma.order.update({
    where: { id: orderId },
    data: {
      gst_invoice_pdf_r2_key: r2Key,
      gst_invoice_pdf_url: publicUrl(r2Key),
    },
  });
}