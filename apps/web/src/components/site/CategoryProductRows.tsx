'use client';

import { locationParams, useUserLocation } from '@/lib/nearby-stores';
import { formatPriceRange } from '@kanchuki/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Section, SectionHeader } from './Chrome';
import NearMeBar from './NearMeBar';

interface FeedProduct {
  id: string;
  name: string | null;
  price_min: number | null;
  price_max: number | null;
  primary_photo_url: string;
  shop: { public_slug: string; shop_name: string; city: string | null; distance_km: number | null };
}

interface FeedCategory {
  name: string;
  products: FeedProduct[];
}

const km = (d: number) => (d < 1 ? `${Math.max(100, Math.round(d * 10) * 100)} m` : `${d} km`);

// Homepage "shop by category" rows (F-042). Renders nothing until the API
// returns at least one row that cleared its thinness threshold, so a young
// directory never shows an empty or lopsided section.
export default function CategoryProductRows() {
  const [categories, setCategories] = useState<FeedCategory[]>([]);
  const loc = useUserLocation();
  const { coords } = loc;

  useEffect(() => {
    let cancelled = false;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const params = new URLSearchParams(locationParams(coords));
    fetch(`${apiUrl}/v1/public/category-feed?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && Array.isArray(res?.data?.categories)) setCategories(res.data.categories);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [coords]);

  if (categories.length === 0) return null;

  return (
    <Section id="shop-by-category" className="bg-cream">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          tag="Shop by Category"
          title="Browse what shops have in stock."
          subtitle="Tap any piece to open it in the shop's own catalog and message them on WhatsApp."
        />

        <NearMeBar loc={loc} radiusKm={null} empty={false} />

        <nav aria-label="Categories" className="mb-8 flex flex-wrap justify-center gap-2">
          {categories.map((c) => (
            <a
              key={c.name}
              href={`#cat-${encodeURIComponent(c.name)}`}
              className="min-h-11 inline-flex items-center rounded-full border border-carbon/15 bg-white px-4 text-sm font-semibold text-carbon hover:border-cobalt-500 hover:text-cobalt-600 transition"
            >
              {c.name}
            </a>
          ))}
        </nav>

        <div className="space-y-10">
          {categories.map((c) => (
            <div key={c.name} id={`cat-${encodeURIComponent(c.name)}`} className="scroll-mt-24">
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-carbon mb-4">
                {c.name}
              </h3>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                {c.products.map((p) => (
                  <li key={p.id} className="w-40 sm:w-48 shrink-0 snap-start">
                    <Link
                      // `all-{store}` is the browse pseudo-slug the product page resolves
                      // (see [store]/[collection]/product/[productId]/page.tsx).
                      href={`/${p.shop.public_slug}/all-${p.shop.public_slug}/product/${p.id}`}
                      className="block overflow-hidden rounded-2xl border border-carbon/10 bg-white shadow-sm hover:shadow-md transition"
                    >
                      <div className="aspect-[3/4] bg-carbon/5">
                        <img
                          src={p.primary_photo_url}
                          alt={p.name ?? c.name}
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
                          {p.shop.distance_km !== null
                            ? ` · ${km(p.shop.distance_km)}`
                            : p.shop.city
                              ? ` · ${p.shop.city}`
                              : ''}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
