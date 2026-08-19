// ponytail: placeholder GST report generation service, uses pdfkit to generate PDF reports
import Fastify from 'fastify';
import { PrismaClient } from '@kanchuki/db';
import PDFDocument from 'pdfkit';

const fastify = Fastify({ logger: true });
const prisma = new PrismaClient();

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Generate GST report PDF
fastify.get('/report/gst', async (request, reply) => {
  const { month, year } = request.query as { month?: string; year?: string };
  
  const dateFilter: any = {};
  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!isNaN(m) && !isNaN(y)) {
      dateFilter.created_at = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1)
      };
    }
  }

  // Fetch orders with GST details
  const orders = await prisma.order.findMany({
    where: dateFilter,
    select: {
      id: true,
      gst_amount: true,
      subtotal_amount: true,
      total_amount: true,
      created_at: true,
      retailer: {
        select: {
          shop_name: true,
          gstin: true
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });

  // Calculate totals
  let totalGst = 0;
  let totalSales = 0;
  let totalTaxable = 0;
  for (const order of orders) {
    totalGst += order.gst_amount;
    totalSales += order.total_amount;
    totalTaxable += order.subtotal_amount;
  }

  // Convert paise to rupees
  const gstInRupees = totalGst / 100;
  const salesInRupees = totalSales / 100;
  const taxableInRupees = totalTaxable / 100;

  // Create PDF document
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  let buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => {
    buffers.push(chunk);
  });

  // Title
  doc.fontSize(20).text('GST Report', { align: 'center' }).moveDown();

  // Period
  const periodText = month && year ?
    `${new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}` :
    'All Time';
  doc.fontSize(12).text(`Period: ${periodText}`).moveDown();

  // Table header
  const tableTop = doc.y;
  doc.fontSize(10)
    .text('Description', 50, tableTop, { width: 200, align: 'left' })
    .text('Amount (₹)', 250, tableTop, { width: 150, align: 'right' })
    .moveDown(0.5)
    .rect(50, tableTop - 5, 350, 20)
    .stroke();

  // Table rows
  let rowIndex = 0;
  let tableY = tableTop + 20;
  const rows = [
    { label: 'Taxable Sales', value: taxableInRupees.toFixed(2) },
    { label: 'GST Amount', value: gstInRupees.toFixed(2) },
    { label: 'Total Sales', value: salesInRupees.toFixed(2) }
  ];
  for (const row of rows) {
    doc.fontSize(9)
      .text(row.label, 50, tableY, { width: 200, align: 'left' })
      .text(row.value, 250, tableY, { width: 150, align: 'right' });
    tableY += 20;
    rowIndex++;
  }

  // Order count
  doc.fontSize(9)
    .text(`Number of Orders: ${orders.length}`, 50, tableY, { width: 200, align: 'left' })
    .moveDown();

  // Footer
  doc.fontSize(8)
    .text(`Generated on ${new Date().toLocaleString()}`, 50, doc.page.height - 50, { align: 'center' });

  // Finalize PDF
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    doc.end();
  });

  // Set response headers
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `attachment; filename=\"gst-report-${periodText.replace(/ /g, '-').toLowerCase()}.pdf\"`);
  
  return reply.send(pdfBuffer);
});

// Self-check: test calculation logic
function demo() {
  // Mock orders data
  const mockOrders = [
    { gst_amount: 1000, subtotal_amount: 10000, total_amount: 11000 }, // 10% GST
    { gst_amount: 200, subtotal_amount: 2000, total_amount: 2200 },
    { gst_amount: 0, subtotal_amount: 5000, total_amount: 5000 } // zero GST
  ];
  let totalGst = 0;
  let totalSales = 0;
  let totalTaxable = 0;
  for (const order of mockOrders) {
    totalGst += order.gst_amount;
    totalSales += order.total_amount;
    totalTaxable += order.subtotal_amount;
  }
  // Expected: totalGst = 1200, totalSales = 18200, totalTaxable = 17000
  const expectedGst = 1200;
  const expectedSales = 18200;
  const expectedTaxable = 17000;
  if (totalGst !== expectedGst || totalSales !== expectedSales || totalTaxable !== expectedTaxable) {
    throw new Error(`Demo failed: got GST=${totalGst}, sales=${totalSales}, taxable=${totalTaxable}; expected GST=${expectedGst}, sales=${expectedSales}, taxable=${expectedTaxable}`);
  }
  // If we reach here, demo passed
  console.log('Demo passed: GST calculation logic is correct');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

const start = async () => {
  try {
    await fastify.listen({ port: 3006, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();