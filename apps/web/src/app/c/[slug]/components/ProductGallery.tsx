'use client';

import { resolveFashionColor } from '@kanchuki/shared';
import { ChevronLeft, ChevronRight, Palette, ShoppingBag, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useMemo, useRef, useState } from 'react';

interface Variant {
  color: string;
  photoUrl: string | null;
  status: string;
}

interface Props {
  photos: string[];
  variants: Variant[];
  alt: string;
  isSold?: boolean;
  isReserved?: boolean;
}

interface Slide {
  url: string;
  color: string | null;
}

const SWIPE_THRESHOLD = 50;

// Swipeable photo/variant gallery for the shared product page. Slides are the
// product's photos followed by any variant photos (deduped, variants last so
// tapping a color chip scrolls to its photo). Pure client component — the page
// it lives on stays a server component.
export function ProductGallery({ photos, variants, alt, isSold, isReserved }: Props) {
  const slides = useMemo<Slide[]>(() => {
    const seen = new Set<string>();
    const list: Slide[] = [];
    for (const url of photos) {
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push({ url, color: null });
      }
    }
    for (const v of variants) {
      if (v.photoUrl && !seen.has(v.photoUrl)) {
        seen.add(v.photoUrl);
        list.push({ url: v.photoUrl, color: v.color });
      }
    }
    return list;
  }, [photos, variants]);

  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  // Set briefly after a swipe so the click that can follow a fast swipe doesn't
  // bounce the user into the fullscreen viewer.
  const swipedRef = useRef(false);

  const current = slides[index] ?? null;

  const goTo = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(i, slides.length - 1)));
    },
    [slides.length],
  );

  // Jump to the slide carrying this variant's photo (color chip tap).
  const goToVariant = useCallback(
    (color: string) => {
      const idx = slides.findIndex((s) => s.color === color);
      if (idx >= 0) goTo(idx);
    },
    [slides, goTo],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const delta = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
      if (Math.abs(delta) > SWIPE_THRESHOLD) {
        if (delta < 0 && index < slides.length - 1) goTo(index + 1);
        else if (delta > 0 && index > 0) goTo(index - 1);
        swipedRef.current = true;
        window.setTimeout(() => {
          swipedRef.current = false;
        }, 350);
      }
      touchStartX.current = null;
    },
    [index, slides.length, goTo],
  );

  const sold = isSold;
  const reserved = isReserved;
  const slideCount = slides.length;

  return (
    <div>
      {/* ── Carousel ── */}
      <div
        className="relative w-full aspect-[3/4] rounded-3xl overflow-hidden bg-gray-100 shadow-soft border border-gray-100 select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
{current ? (
             <>
               {/* The photo layer is a real button — tap/click opens the
                   fullscreen viewer (arrows/badges are siblings above it). */}
               <button
                 type="button"
                 onClick={() => {
                   if (swipedRef.current) return;
                   setFullscreen(true);
                 }}
                 aria-label="Open photo in fullscreen"
                 className="absolute inset-0 block w-full h-full p-0 border-0 bg-transparent cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
               >
                 <Image
                   key={current.url}
                   src={current.url}
                   alt={alt}
                   fill
                   priority={index === 0} // Only first slide gets priority for LCP
                   loading={index === 0 ? undefined : 'lazy'} // Lazy load non-priority images
                   sizes="(max-width: 640px) 100vw, 448px"
                   className={`object-cover ${sold ? 'grayscale opacity-80' : ''} animate-gallery-fade`}
                 />
               </button>

            {/* Variant color badge — bottom-left so it can't collide with the
                Sold/Reserved ribbon (top-left) or the counter (bottom-right). */}
            {current.color && (
              <div className="absolute bottom-3 left-3 z-10 bg-cyan-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm pointer-events-none">
                <Palette size={12} />
                {current.color}
              </div>
            )}

            {/* Sold / Reserved ribbon */}
            {sold && (
              <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full shadow-sm">
                Sold
              </div>
            )}
            {reserved && (
              <div className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full shadow-sm">
                Reserved
              </div>
            )}

            {/* Navigation arrows — hidden while fullscreen is open */}
            {slideCount > 1 && !fullscreen && (
              <>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(index - 1);
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-soft flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={18} className="text-gray-700" />
                  </button>
                )}
                {index < slideCount - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(index + 1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-soft flex items-center justify-center z-10 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    aria-label="Next photo"
                  >
                    <ChevronRight size={18} className="text-gray-700" />
                  </button>
                )}
              </>
            )}

            {/* Counter — bottom-right */}
            {slideCount > 1 && (
              <div className="absolute bottom-3 right-3 z-10 bg-black/50 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none">
                {index + 1} / {slideCount}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={40} className="text-gray-300" />
          </div>
        )}
      </div>

      {/* ── Thumbnail strip (photos + variant photos) ── */}
      {slideCount > 1 && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide snap-x">
{slides.map((slide, i) => (
             <button
               type="button"
               key={slide.url}
               onClick={() => goTo(i)}
               aria-label={slide.color ? `${slide.color} photo` : `Photo ${i + 1}`}
               className={`relative flex-shrink-0 w-14 aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all snap-start ${
                 i === index
                   ? 'border-cyan-500 shadow-soft'
                   : 'border-transparent opacity-70 hover:opacity-100'
               }`}
             >
               <Image
                 src={slide.url}
                 alt=""
                 fill
                 sizes="56px"
                 loading="lazy" // Lazy load all thumbnail images
                 className={`object-cover ${sold ? 'grayscale opacity-80' : ''}`}
               />
              {slide.color && (
                <span className="absolute bottom-0.5 left-1 text-[7px] font-semibold text-white bg-black/50 rounded px-1 py-px truncate max-w-full">
                  {slide.color}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Color chips — tapping one jumps to its photo ── */}
{variants.length > 0 && (
         <div className="mt-3">
           <p className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-1.5">
             <Palette size={12} />
             Available Colors
           </p>
           <div className="flex flex-wrap gap-2">
             {variants.map((v) =>
               v.photoUrl ? (
                 <button
                   type="button"
                   key={v.color}
                   onClick={v.status === 'SOLD' ? undefined : () => goToVariant(v.color)}
                   className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                     v.status === 'SOLD' ? 'opacity-50 cursor-not-allowed' : ''
                   }`}
                   title={v.status === 'SOLD' ? 'Sold out' : `See ${v.color} photo`}
                   disabled={v.status === 'SOLD'}
                 >
                   <span
                     className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                     style={{ backgroundColor: resolveFashionColor(v.color) }}
                   />
                   {v.color}
                   {v.status === 'SOLD' && <span className="text-xs text-red-400">(Sold)</span>}
                 </button>
               ) : (
                 <span
                   key={v.color}
                   className={`flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-700 ${
                     v.status === 'SOLD' ? 'opacity-50' : ''
                   }`}
                 >
                   <span
                     className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                     style={{ backgroundColor: resolveFashionColor(v.color) }}
                   />
                   {v.color}
                   {v.status === 'SOLD' && <span className="text-xs text-red-400">(Sold)</span>}
                 </span>
               ),
             )}
           </div>
         </div>
       )}

      {/* ── Fullscreen lightbox ── */}
      {fullscreen && current && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setFullscreen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setFullscreen(false);
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(false);
            }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10 transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Close fullscreen photo"
          >
            <X size={20} className="text-white" />
          </button>
          {index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goTo(index - 1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10 transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} className="text-white" />
            </button>
          )}
          {index < slideCount - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goTo(index + 1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10 transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              aria-label="Next photo"
            >
              <ChevronRight size={20} className="text-white" />
            </button>
          )}
<div
             className="relative w-full h-full max-w-lg max-h-[100vh]"
             onClick={(e) => e.stopPropagation()}
             onKeyDown={(e) => e.stopPropagation()}
             onTouchStart={handleTouchStart}
             onTouchEnd={handleTouchEnd}
           >
             <Image src={current.url} alt={alt} fill sizes="100vw" 
                    priority={index === 0} // Only first slide gets priority for LCP
                    loading={index === 0 ? undefined : 'lazy'} // Lazy load non-priority images
                    className="object-contain" />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
              {index + 1} / {slideCount}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .animate-gallery-fade {
          animation: galleryFade 0.25s ease-in-out;
        }
        @keyframes galleryFade {
          from { opacity: 0.4; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
