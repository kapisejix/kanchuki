'use client';

import { type PublicProduct, formatPriceRange } from '@kanchuki/shared';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCurrentVisitProductIds, subscribeCurrentVisit } from '../lib/currentVisit';
import { fetchPickedForYou } from '../lib/pickedForYou';

interface Props {
  storeSlug: string | null;
  onProductTap: (product: PublicProduct) => void;
}

export function PickedForYou({ storeSlug, onProductTap }: Props) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [personalized, setPersonalized] = useState(false);
  const [responseStoreSlug, setResponseStoreSlug] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!storeSlug) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFailed(false);
    const result = await fetchPickedForYou(storeSlug, loadCurrentVisitProductIds(storeSlug));
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    if (!result) {
      setFailed(true);
      setResponseStoreSlug(storeSlug);
      return;
    }
    setProducts(result.products);
    setPersonalized(result.personalized);
    setResponseStoreSlug(storeSlug);
  }, [storeSlug]);

  useEffect(() => {
    void refresh();
    if (!storeSlug) return;
    const unsubscribe = subscribeCurrentVisit(storeSlug, () => void refresh());
    return () => {
      requestIdRef.current += 1;
      unsubscribe();
    };
  }, [storeSlug, refresh]);

  if (!storeSlug) return null;
  const currentStoreProducts = responseStoreSlug === storeSlug ? products : [];
  const currentStoreFailed = responseStoreSlug === storeSlug && failed;
  const isPersonalized = responseStoreSlug === storeSlug && personalized;

  return (
    <section className="mb-5" aria-labelledby="picked-for-you-heading" aria-busy={loading}>
      <div className="mb-2 flex items-center justify-between px-1">
        <div>
          <h2
            id="picked-for-you-heading"
            className="text-sm font-bold text-[#231F48] font-marcellus"
          >
            {isPersonalized ? 'Picked for you' : 'From this store'}
          </h2>
          <p className="text-[10px] text-[#6B4773]">
            {isPersonalized ? 'Based on your activity in this store' : 'More available styles'}
          </p>
        </div>
        {loading && <output className="text-[10px] text-[#6B4773]">Updating…</output>}
      </div>

      {currentStoreFailed ? (
        <div
          className="rounded-2xl border border-[#E0E1F6] bg-white px-4 py-3 text-xs text-[#6B4773]"
          role="alert"
        >
          <span>Could not load picks right now.</span>{' '}
          <button
            type="button"
            className="font-bold text-[#231F48] underline underline-offset-2"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </div>
      ) : currentStoreProducts.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
          {currentStoreProducts.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => onProductTap(product)}
              className="w-32 flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-[#E0E1F6] bg-white p-1.5 text-left shadow-sm"
              aria-label={`View ${product.name ?? product.category ?? 'product'}`}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#FAF9FE]">
                {product.primary_photo_url ? (
                  <Image
                    src={product.primary_photo_url}
                    alt={product.name ?? product.category ?? 'Product'}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[#928EB2]">
                    No photo
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-[11px] font-bold text-[#231F48]">
                {product.name ?? product.category ?? 'Ethnic Wear'}
              </p>
              <p className="truncate text-[10px] font-semibold text-[#6B4773]">
                {formatPriceRange(product.price_min, product.price_max)}
              </p>
            </button>
          ))}
        </div>
      ) : loading ? (
        <output className="px-1 text-xs text-[#6B4773]">Finding something for you…</output>
      ) : null}
    </section>
  );
}
