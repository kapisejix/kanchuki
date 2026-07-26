'use client'

import { Bricolage_Grotesque } from 'next/font/google'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactNode, Suspense } from 'react'

// Same display font as the /c/[slug] collection route — the category
// browsing pages reuse CollectionView, which expects font-display to resolve.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

interface Props {
  children: ReactNode
}

export default function CategoriesLayout({ children }: Props) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.97, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`min-h-screen ${display.variable}`}
      >
        <Suspense fallback={null}>
          {children}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}
