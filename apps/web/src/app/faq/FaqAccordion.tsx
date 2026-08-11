'use client'

// Client-only accordion (needs useState for open/close) — kept separate
// from page.tsx so the page stays a Server Component and can export
// `metadata` + FAQPage JSON-LD.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3 mt-6">
      {items.map((item, i) => (
        <div key={item.q} className={`bg-white rounded-2xl border transition-colors duration-300 ${openIndex === i ? 'border-cobalt-500' : 'border-carbon/10 hover:border-carbon/25'}`}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-500 focus-visible:ring-offset-2 rounded-2xl"
            aria-expanded={openIndex === i}
            aria-controls={`faq-${item.q}`}
          >
            <span className="text-sm font-semibold text-carbon pr-4">{item.q}</span>
            <ChevronDown size={18} strokeWidth={1.5} className={`text-carbon/40 shrink-0 transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {openIndex === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden" id={`faq-${item.q}`} role="region">
                <div className="px-6 pb-5 text-sm text-carbon/60 leading-relaxed border-t border-carbon/10 pt-4">{item.a}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}
