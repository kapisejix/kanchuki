import type { PublicCollection, PublicProductDetail } from '@kanchuki/shared';
import { buildEnquiryMessage, buildWhatsAppEnquiryLink, formatPriceRange } from '@kanchuki/shared';
import { ArrowLeft, Info, MapPin, MessageCircle, ShoppingBag, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ProductGallery } from './ProductGallery';

interface Props {
  collection: PublicCollection;
  product: PublicProductDetail;
  // Canonical base path for this collection (e.g. /meera-sarees/festive-edit
  // or the legacy /c/festive-edit) — where the back-to-catalog CTA points.
  collectionPath: string;
}

// Shared product link page body — the URL customers forward on WhatsApp. The
// OG image is the product's own photo (set by the route's generateMetadata)
// so the WhatsApp preview shows the product, and the primary CTA takes the
// recipient back into the full catalog.
export function SharedProductPage({ collection, product, collectionPath }: Props) {
  const shop = collection.retailer.shop_name;
  const city = collection.retailer.city;
  const isSold = product.status === 'SOLD';
  const isReserved = product.status === 'RESERVED';

  // Server-built WhatsApp enquiry deep link — the recipient can message the
  // shop about this exact product without any client-side logic.
  const enquiryMessage = buildEnquiryMessage({
    shopName: shop,
    collectionTitle: collection.title,
    products: [product],
  });
  const enquiryUrl = buildWhatsAppEnquiryLink(collection.retailer.phone, enquiryMessage);

  const galleryAlt = product.name ?? product.subtype ?? product.category ?? 'Product';

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Header — back to the catalog ── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link
            href={collectionPath}
            className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] text-cyan-700/80 font-semibold uppercase tracking-wider truncate">
              {shop}
              {city ? ` · ${city}` : ''}
            </p>
            <h1 className="font-display text-base font-bold text-gray-900 truncate">
              {collection.title}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4">
        {/* ── Swipeable photo/variant gallery ── */}
        <ProductGallery
          photos={product.photos}
          variants={product.variants.map((v) => ({
            color: v.color,
            photoUrl: v.photo_url,
            status: v.status,
          }))}
          alt={galleryAlt}
          isSold={isSold}
          isReserved={isReserved}
        />

        {/* ── Price + name ── */}
        <div className="mt-4 space-y-3">
          <div>
            <p
              className={`font-display text-3xl font-bold tabular-nums tracking-tight ${
                isSold ? 'text-gray-400 line-through' : 'text-gray-900'
              }`}
            >
              {formatPriceRange(product.price_min, product.price_max)}
            </p>
            {(product.name || product.category) && (
              <h2 className="text-lg font-semibold text-gray-900 mt-1">
                {product.name ?? product.category}
              </h2>
            )}
            {product.category && product.name && (
              <p className="text-sm text-gray-500">{product.category}</p>
            )}
          </div>

          {/* Store location — tell staff where to find this item */}
          {product.location && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
              <MapPin size={14} />
              {product.location}
            </div>
          )}

          {/* AI Summary */}
          {product.description && (
            <div className="bg-cyan-50/60 border border-cyan-100 rounded-2xl px-3.5 py-3">
              <p className="text-xs font-semibold text-cyan-800 flex items-center gap-1.5 mb-1">
                <Sparkles size={13} />
                AI Summary
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Product Info */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-3.5 py-3">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 mb-2">
              <Info size={13} />
              Product Info
            </p>
            <div className="space-y-1.5">
              {product.subtype && <InfoRow label="Type" value={product.subtype} />}
              {product.fabric_estimate && (
                <InfoRow label="Fabric" value={product.fabric_estimate} />
              )}
            </div>
          </div>

          {/* Sizes */}
          {product.sizes.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Available Sizes</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <span
                    key={size}
                    className="text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full"
                  >
                    {size}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── CTAs — enquire on WhatsApp + browse the full catalog ── */}
        {!isSold && (
          <div className="mt-5 space-y-2.5">
            <a
              href={enquiryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full font-semibold py-3.5 rounded-2xl
                         bg-green-500 hover:bg-green-600 text-white shadow-soft hover:shadow-soft-lg
                         transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              <MessageCircle size={18} />
              Enquire on WhatsApp
            </a>
          </div>
        )}

        <Link
          href={collectionPath}
          className="mt-2.5 flex items-center justify-center gap-2 w-full font-semibold py-3.5 rounded-2xl
                     bg-cyan-600 hover:bg-cyan-700 text-white shadow-soft hover:shadow-soft-lg
                     transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
        >
          <ShoppingBag size={18} />
          View Full Catalog
        </Link>

        <p className="text-center text-xs text-gray-400 mt-4">
          Shared from {shop}
          {city ? `, ${city}` : ''} via Kanchuki
        </p>
        <div className="pb-6" />
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-gray-400 w-16 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}
