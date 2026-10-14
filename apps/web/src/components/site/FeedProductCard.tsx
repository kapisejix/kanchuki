'use client';

import { recordInterest } from '@/lib/interests';
import { formatPriceRange } from '@kanchuki/shared';
import Link from 'next/link';

export interface FeedProduct {
  id: string;
  name: string | null;
  category: string | null;
  subtype: string | null;
  primary_color: string | null;
  price_min: number | null;
  price_max: number | null;
  primary_photo_url: string;
  shop: { public_slug: string; shop_name: string; city: string | null; distance_km: number | null };
}

const km = (d: number) => (d < 1 ? `${Math.max(100, Math.round(d * 10) * 100)} m` : `${d} km`);

// Product card shared by the homepage category grid and /category/[name].
export default function FeedProductCard({
  p,
  fallbackAlt,
}: {
  p: FeedProduct;
  fallbackAlt: string;
}) {
  const place =
    p.shop.distance_km !== null
      ? ` · ${km(p.shop.distance_km)}`
      : p.shop.city
        ? ` · ${p.shop.city}`
        : '';
  return (
    <Link
      // `all-{store}` is the browse pseudo-slug the product page resolves
      // (see [store]/[collection]/product/[productId]/page.tsx).
      href={`/${p.shop.public_slug}/all-${p.shop.public_slug}/product/${p.id}`}
      onClick={() => recordInterest([p.category, p.subtype, p.primary_color])}
      className="block overflow-hidden rounded-2xl border border-carbon/10 bg-white shadow-sm hover:shadow-md transition"
    >
      <div className="aspect-[3/4] bg-carbon/5">
        <img
          src={p.primary_photo_url}
          alt={p.name ?? fallbackAlt}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-carbon">
          {formatPriceRange(p.price_min, p.price_max)}
        </p>
        <p className="mt-0.5 truncate text-xs text-carbon/60">
          {p.shop.shop_name}
          {place}
        </p>
      </div>
    </Link>
  );
}
