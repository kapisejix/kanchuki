'use client'

import { useState } from 'react'
import { Info, X } from 'lucide-react'

// Indian fabric descriptions — educational content for first-time online buyers
const FABRIC_GLOSSARY: Record<string, { description: string; care: string; best_for: string }> = {
  cotton: {
    description: 'Natural, breathable fiber ideal for India\'s warm climate. Soft against skin, gets softer with each wash.',
    care: 'Machine washable. May shrink slightly on first wash.',
    best_for: 'Daily wear, summer, casual outings',
  },
  silk: {
    description: 'Luxurious natural fiber with a rich sheen. Varieties include Banarasi, Kanjeevaram, Tussar, and Chanderi.',
    care: 'Dry clean recommended. Store wrapped in muslin cloth.',
    best_for: 'Weddings, festivals, formal occasions',
  },
  georgette: {
    description: 'Lightweight, sheer fabric with a slightly crinkled texture. Drapes beautifully and is easy to maintain.',
    care: 'Hand wash or dry clean. Avoid wringing.',
    best_for: 'Sarees, dupattas, flowy suits',
  },
  chiffon: {
    description: 'Sheer, lightweight fabric with a soft drape. Often used in layered sarees and evening wear.',
    care: 'Hand wash in cold water. Iron on low heat.',
    best_for: 'Sarees, evening wear, layered outfits',
  },
  crepe: {
    description: 'Textured fabric with a crinkled surface. Holds shape well and resists wrinkling.',
    care: 'Machine washable on gentle cycle.',
    best_for: 'Suits, sarees, workwear',
  },
  velvet: {
    description: 'Rich, plush fabric with a soft pile. Adds warmth and a regal touch to any outfit.',
    care: 'Dry clean only. Store hanging to prevent crushing.',
    best_for: 'Winter wear, wedding outfits, formal occasions',
  },
  linen: {
    description: 'Strong natural fiber from flax plant. Highly breathable and absorbs moisture. wrinkles are part of its charm.',
    care: 'Machine washable. Iron while slightly damp.',
    best_for: 'Summer wear, casual formal, daily wear',
  },
  rayon: {
    description: 'Semi-synthetic fiber made from cellulose. Mimics the feel of silk at a fraction of the cost.',
    care: 'Hand wash or machine wash on gentle. Avoid tumble drying.',
    best_for: 'Casual wear, daily wear, affordable ethnic wear',
  },
  chanderi: {
    description: 'Traditional handloom fabric from Madhya Pradesh. Lightweight with a glossy texture and sheer finish.',
    care: 'Dry clean recommended. Store carefully.',
    best_for: 'Sarees, suits, festive wear',
  },
  banarasi: {
    description: 'Rich silk fabric from Varanasi with intricate gold/silver zari work. A timeless classic for Indian weddings.',
    care: 'Dry clean only. Store in breathable fabric.',
    best_for: 'Wedding sarees, bridal wear, special occasions',
  },
  kanjeevaram: {
    description: 'Thick, durable silk from Tamil Nadu with bold borders and contrasting colors. Known for longevity.',
    care: 'Dry clean. Store folded in cotton cloth.',
    best_for: 'South Indian weddings, temple visits, formal events',
  },
  modal: {
    description: 'Soft, breathable fabric with a silky feel. Blends well with cotton for comfortable everyday wear.',
    care: 'Machine washable. Low heat ironing.',
    best_for: 'Daily wear, casual ethnic wear',
  },
  muslin: {
    description: 'Fine, lightweight cotton historically from Bengal. Known for its incredible softness and delicate weave.',
    care: 'Hand wash gently. Avoid harsh detergents.',
    best_for: 'Sarees, summer wear, delicate outfits',
  },
  tussar: {
    description: 'Wild silk with a natural gold tint. Lightweight and porous, perfect for warm weather.',
    care: 'Dry clean or gentle hand wash.',
    best_for: 'Sarees, suits, festive wear',
  },
  net: {
    description: 'Open-weave fabric with a mesh-like texture. Often used as an overlay or for embellished designs.',
    care: 'Hand wash carefully. Avoid snagging.',
    best_for: 'Lehengas, dupattas, party wear',
  },
  organza: {
    description: 'Sheer, lightweight fabric with a crisp drape. Often embroidered or embellished for formal wear.',
    care: 'Dry clean recommended. Handle with care.',
    best_for: 'Sarees, lehengas, formal occasions',
  },
  satin: {
    description: 'Smooth, glossy fabric with a luxurious feel. Reflects light beautifully for a rich appearance.',
    care: 'Dry clean or gentle hand wash.',
    best_for: 'Evening wear, formal suits, bridal wear',
  },
  khadi: {
    description: 'Hand-spun, hand-woven natural fabric. A symbol of Indian heritage with a unique textured feel.',
    care: 'Hand wash. May shrink slightly.',
    best_for: 'Daily wear, summer, patriotic occasions',
  },
  poly: {
    description: 'Synthetic fiber that resists wrinkles and retains color well. Blended with natural fibers for durability.',
    care: 'Machine washable. Quick drying.',
    best_for: 'Daily wear, low-maintenance outfits',
  },
  polyester: {
    description: 'Synthetic fiber that resists wrinkles and retains color well. Blended with natural fibers for durability.',
    care: 'Machine washable. Quick drying.',
    best_for: 'Daily wear, low-maintenance outfits',
  },
  spandex: {
    description: 'Elastic synthetic fiber that provides stretch and comfort. Usually blended with other fabrics.',
    care: 'Machine washable. Avoid high heat.',
    best_for: 'Fitted garments, stretch comfort',
  },
  lycra: {
    description: 'Brand name for spandex — stretchy, comfortable, and shape-retaining. Perfect for fitted ethnic wear.',
    care: 'Machine washable. Avoid high heat.',
    best_for: 'Fitted suits, bodycon styles',
  },
  wool: {
    description: 'Natural fiber from sheep. Warm, durable, and moisture-wicking. Essential for Indian winters.',
    care: 'Hand wash or dry clean. Store with mothballs.',
    best_for: 'Winter shawls, sweaters, formal coats',
  },
  cashmere: {
    description: 'Luxurious wool from cashmere goats. Incredibly soft and lightweight yet very warm.',
    care: 'Hand wash in cold water. Lay flat to dry.',
    best_for: 'Premium shawls, luxury winter wear',
  },
}

// Normalize fabric name for lookup
function normalizeFabric(name: string): string {
  return name.toLowerCase().trim()
}

// Find the best match for a fabric name
function findFabricInfo(name: string): { description: string; care: string; best_for: string } | null {
  const normalized = normalizeFabric(name)
  // Exact match first
  if (FABRIC_GLOSSARY[normalized]) return FABRIC_GLOSSARY[normalized]
  // Partial match
  for (const [key, value] of Object.entries(FABRIC_GLOSSARY)) {
    if (normalized.includes(key) || key.includes(normalized)) return value
  }
  return null
}

interface Props {
  fabric: string
}

export function FabricGlossary({ fabric }: Props) {
  const [open, setOpen] = useState(false)
  const info = findFabricInfo(fabric)

  if (!info) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium transition-colors"
      >
        <Info size={12} />
        What is {fabric}?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl max-w-sm w-full mx-4 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900 capitalize">{fabric}</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">About</p>
                <p className="text-sm text-gray-700 leading-relaxed">{info.description}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Best For</p>
                <p className="text-sm text-gray-700">{info.best_for}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Care Tips</p>
                <p className="text-sm text-gray-700">{info.care}</p>
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
