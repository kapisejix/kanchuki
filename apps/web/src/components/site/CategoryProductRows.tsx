'use client';

import { interestScore, topInterests } from '@/lib/interests';
import { locationParams, useUserLocation } from '@/lib/nearby-stores';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Section, SectionHeader } from './Chrome';
import FeedProductCard, { type FeedProduct } from './FeedProductCard';
import NearMeBar from './NearMeBar';

interface FeedCategory {
  name: string;
  products: FeedProduct[];
}

// Plain grid, not a carousel: 5 columns x 3 rows on desktop (15 products),
// fewer columns on narrow screens. "View more" opens /category/[name].
function ProductRow({
  id,
  title,
  products,
  moreHref,
}: {
  id: string;
  title: string;
  products: FeedProduct[];
  moreHref?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <h3 className="font-display text-xl sm:text-2xl font-semibold text-carbon mb-4">{title}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {products.map((p) => (
          <li key={p.id}>
            <FeedProductCard p={p} fallbackAlt={title} />
          </li>
        ))}
      </ul>
      {moreHref && (
        <div className="mt-5 text-center">
          <Link
            href={moreHref}
            className="inline-flex min-h-11 items-center rounded-full border border-carbon/20 px-6 text-sm font-semibold text-carbon hover:border-cobalt-500 hover:text-cobalt-600 transition"
          >
            View more {title}
          </Link>
        </div>
      )}
    </div>
  );
}

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

  // Device-local interests (lib/interests.ts) → rank the feed client-side.
  // Read after mount so SSR/hydration never disagree about localStorage.
  const [interests, setInterests] = useState<string[]>([]);
  useEffect(() => setInterests(topInterests()), []);
  const picked = useMemo(() => {
    if (interests.length === 0) return [];
    const seen = new Set<string>();
    return categories
      .flatMap((c) => c.products)
      .filter((p) => !seen.has(p.id) && seen.add(p.id))
      .map((p) => ({
        p,
        score: interestScore([p.category, p.subtype, p.primary_color, p.name], interests),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
  }, [categories, interests]);

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
          {picked.length > 0 && (
            <ProductRow id="picked" title="Picked for you" products={picked.slice(0, 5)} />
          )}
          {categories.map((c) => (
            <ProductRow
              key={c.name}
              id={`cat-${encodeURIComponent(c.name)}`}
              title={c.name}
              products={c.products}
              moreHref={`/category/${encodeURIComponent(c.name)}`}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
