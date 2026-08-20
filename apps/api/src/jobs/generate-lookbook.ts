// Lookbook HTML/PDF rendering job.
//
// Takes a lookbook ID, fetches its products, generates a styled HTML page
// with product photos and descriptions, then converts to PDF using pdfkit.
// Stores the output on R2 and updates the Lookbook record.

import { prisma } from '@kanchuki/db';
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { R2_PATHS } from '@kanchuki/shared';
import PDFDocument from 'pdfkit';
import type { LookbookFormat } from '@kanchuki/db';

export interface LookbookJobData {
  lookbook_id: string;
  retailer_id: string;
}

// ─── Format-specific layout configs ────────────────────────────────

const FORMAT_CONFIG: Record<LookbookFormat, { cols: number; label: string }> = {
  CAROUSEL: { cols: 1, label: 'Carousel' },
  GRID: { cols: 2, label: 'Grid' },
  EDITORIAL: { cols: 1, label: 'Editorial' },
  PDF: { cols: 2, label: 'PDF' },
};

// ─── HTML Generation ──────────────────────────────────────────────

function generateLookbookHtml(
  lookbookName: string,
  description: string | null,
  format: LookbookFormat,
  products: Array<{
    name: string | null;
    category: string | null;
    primary_color: string | null;
    price_min: number | null;
    photo_url: string;
  }>,
): string {
  const config = FORMAT_CONFIG[format];
  const isEditorial = format === 'EDITORIAL';

  const productCards = products
    .map(
      (p, i) => `
    <div class="product-card ${isEditorial ? 'editorial' : ''}">
      <img src="${p.photo_url}" alt="${p.name ?? 'Product'}" class="product-image" />
      <div class="product-info">
        <h3 class="product-name">${p.name ?? `Product ${i + 1}`}</h3>
        ${p.category ? `<span class="product-category">${p.category}</span>` : ''}
        ${p.primary_color ? `<span class="product-color">${p.primary_color}</span>` : ''}
        ${p.price_min ? `<span class="product-price">₹${(p.price_min / 100).toLocaleString('en-IN')}</span>` : ''}
      </div>
    </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${lookbookName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #fafafa;
      color: #1a1a1a;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 48px 32px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .header p {
      font-size: 14px;
      opacity: 0.7;
      max-width: 480px;
      margin: 0 auto;
    }
    .products {
      display: grid;
      grid-template-columns: repeat(${config.cols}, 1fr);
      gap: 24px;
      padding: 32px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .product-card {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      transition: transform 0.2s;
    }
    .product-card:hover { transform: translateY(-2px); }
    .product-card.editorial {
      display: flex;
      flex-direction: row;
    }
    .product-card.editorial .product-image {
      width: 50%;
      height: 280px;
      object-fit: cover;
    }
    .product-card.editorial .product-info {
      width: 50%;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .product-image {
      width: 100%;
      height: 320px;
      object-fit: cover;
    }
    .product-info {
      padding: 16px;
    }
    .product-name {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .product-category, .product-color {
      display: inline-block;
      font-size: 12px;
      background: #f0f0f0;
      padding: 3px 10px;
      border-radius: 20px;
      margin-right: 6px;
      margin-bottom: 4px;
      color: #666;
    }
    .product-price {
      display: inline-block;
      font-size: 14px;
      font-weight: 700;
      color: #1a1a2e;
      margin-top: 8px;
    }
    .footer {
      text-align: center;
      padding: 32px;
      font-size: 12px;
      color: #999;
    }
    .footer a { color: #1a1a2e; text-decoration: none; }
    @media print {
      .product-card { break-inside: avoid; }
      .products { gap: 16px; padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${lookbookName}</h1>
    ${description ? `<p>${description}</p>` : ''}
  </div>
  <div class="products">
    ${productCards}
  </div>
  <div class="footer">
    Curated with ❤️ by <a href="https://kanchuki.app">Kanchuki</a>
  </div>
</body>
</html>`;
}

// ─── PDF Generation ───────────────────────────────────────────────

async function generateLookbookPdf(
  lookbookName: string,
  description: string | null,
  products: Array<{
    name: string | null;
    photo_url: string;
    category: string | null;
    price_min: number | null;
  }>,
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: lookbookName,
          Author: 'Kanchuki',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title page
      doc.fontSize(28).font('Helvetica-Bold').text(lookbookName, { align: 'center' });
      doc.moveDown(0.5);
      if (description) {
        doc.fontSize(12).font('Helvetica').text(description, { align: 'center' });
      }
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica').text(`${products.length} products`, { align: 'center' });
      doc.addPage();

      // Product pages — 2 per page
      for (let i = 0; i < products.length; i++) {
        const p = products[i]!;
        const isLeft = i % 2 === 0;

        if (!isLeft && i > 0) {
          doc.addPage();
        }

        const yStart = isLeft ? 40 : 320;

        try {
          // Fetch product image and draw it
          const response = await fetch(p.photo_url);
          if (response.ok) {
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            doc.image(imageBuffer, 40, yStart, {
              width: doc.page.width - 80,
              height: 240,
              fit: [doc.page.width - 80, 240],
            });
          }
        } catch {
          // Image fetch failed — draw placeholder
          doc.rect(40, yStart, doc.page.width - 80, 240).fill('#f0f0f0');
          doc.fill('#999').fontSize(10).text('Image unavailable', 40, yStart + 110, {
            width: doc.page.width - 80,
            align: 'center',
          });
        }

        const textY = yStart + 250;
        doc.fill('#1a1a1a').fontSize(14).font('Helvetica-Bold').text(p.name ?? `Product ${i + 1}`, 40, textY);
        doc.fontSize(10).font('Helvetica');
        const meta = [p.category, p.price_min ? `₹${(p.price_min / 100).toLocaleString('en-IN')}` : null]
          .filter(Boolean)
          .join(' · ');
        if (meta) doc.text(meta, 40, textY + 20);
      }

      // Footer on last page
      doc.fontSize(8).font('Helvetica').fillColor('#999');
      doc.text('Curated with ❤️ by Kanchuki', 40, doc.page.height - 60, {
        width: doc.page.width - 80,
        align: 'center',
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Job Handler ──────────────────────────────────────────────────

export async function handleGenerateLookbook(data: LookbookJobData): Promise<void> {
  const { lookbook_id, retailer_id } = data;

  // Update status to GENERATING
  await prisma.lookbook.update({
    where: { id: lookbook_id },
    data: { status: 'GENERATING' },
  });

  try {
    // Fetch lookbook + products
    const lookbook = await prisma.lookbook.findUnique({
      where: { id: lookbook_id },
      include: {
        retailer: { select: { shop_name: true } },
      },
    });
    if (!lookbook) throw new Error('Lookbook not found');

    // Fetch product details
    const products = await prisma.product.findMany({
      where: { id: { in: lookbook.product_ids }, retailer_id, deleted_at: null },
      select: {
        name: true,
        category: true,
        primary_color: true,
        price_min: true,
        photos: {
          where: { is_primary: true },
          take: 1,
          select: { url: true },
        },
      },
    });

    // Map products with photo URLs
    const productData = products.map((p) => ({
      name: p.name,
      category: p.category,
      primary_color: p.primary_color,
      price_min: p.price_min,
      photo_url: p.photos[0]?.url ?? '',
    }));

    // Filter out products without photos
    const productsWithPhotos = productData.filter((p) => p.photo_url);
    if (productsWithPhotos.length === 0) {
      throw new Error('No products with photos found');
    }

    // Generate HTML
    const html = generateLookbookHtml(
      lookbook.name,
      lookbook.description,
      lookbook.format,
      productsWithPhotos,
    );

    // Generate PDF
    const pdfBuffer = await generateLookbookPdf(
      lookbook.name,
      lookbook.description,
      productsWithPhotos,
    );

    // Upload HTML to R2
    const htmlKey = R2_PATHS.lookbookOutput(retailer_id, lookbook_id, 'index.html');
    const htmlUploadUrl = await getUploadPresignedUrl(htmlKey, 'text/html', 300);
    await fetch(htmlUploadUrl, { method: 'PUT', body: html, headers: { 'Content-Type': 'text/html' } });

    // Upload PDF to R2
    const pdfKey = R2_PATHS.lookbookOutput(retailer_id, lookbook_id, `${lookbook.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    const pdfUploadUrl = await getUploadPresignedUrl(pdfKey, 'application/pdf', 300);
    await fetch(pdfUploadUrl, { method: 'PUT', body: pdfBuffer, headers: { 'Content-Type': 'application/pdf' } });

    const outputUrl = publicUrl(htmlKey);
    const pdfUrl = publicUrl(pdfKey);

    // Generate share URL
    const shareUrl = `/lookbooks/${lookbook_id}`;

    // Update lookbook record
    await prisma.lookbook.update({
      where: { id: lookbook_id },
      data: {
        status: 'READY',
        output_url: outputUrl,
        output_r2_key: htmlKey,
        thumbnail_url: productData[0]?.photo_url ?? null,
        share_url: shareUrl,
      },
    });

    console.log(`[lookbook] Generated lookbook ${lookbook_id}: ${outputUrl}`);
  } catch (err) {
    console.error(`[lookbook] Generation failed for ${lookbook_id}:`, err);

    // Mark as FAILED
    await prisma.lookbook.update({
      where: { id: lookbook_id },
      data: { status: 'FAILED' },
    });

    throw err;
  }
}
