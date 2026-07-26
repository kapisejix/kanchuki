'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * RouteProgress — Slim animated progress bar at the top of the viewport.
 *
 * Tracks route changes by monitoring pathname + searchParams.
 * Shows a smooth progress animation when navigation starts (triggered by
 * loading.tsx mounting) and completes when the new page renders.
 *
 * The progress bar auto-hides 400ms after each route change completes.
 */
export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  )
}

/**
 * Inner component that uses useSearchParams — wrapped in Suspense
 * per Next.js requirement for client-side search params access.
 */
function RouteProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const [progress, setProgress] = useState(0)
  const prevPathRef = useRef(pathname)

  // Detect route changes by watching pathname
  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = pathname

    if (prev !== pathname) {
      setIsNavigating(true)
      setProgress(0)

      const t1 = setTimeout(() => setProgress(30), 50)
      const t2 = setTimeout(() => setProgress(60), 200)
      const t3 = setTimeout(() => setProgress(100), 500)
      const hideTimeout = setTimeout(() => {
        setIsNavigating(false)
        setProgress(0)
      }, 900)

      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
        clearTimeout(hideTimeout)
      }
    }
  }, [pathname])

  return (
    <AnimatePresence>
      {isNavigating && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-[100] h-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {/* Background track */}
          <div className="absolute inset-0 bg-cyan-100/30" />

          {/* Animated bar */}
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ boxShadow: '0 0 8px rgba(6, 182, 212, 0.4)' }}
          />

          {/* Optional glow dot at the tip */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 rounded-full"
            animate={{ left: `${Math.max(progress - 1, 0)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ boxShadow: '0 0 6px rgba(6, 182, 212, 0.6)' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default RouteProgress
