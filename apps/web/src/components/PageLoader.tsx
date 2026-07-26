'use client'

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface PageLoaderProps {
  variant?: 'fullscreen' | 'card' | 'minimal'
  text?: string
}

const containerVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
}

const shimmerVariants = {
  animate: {
    x: ['-100%', '200%'],
    transition: { repeat: Infinity, duration: 1.5, ease: 'easeInOut' },
  },
}

export function PageLoader({ variant = 'fullscreen', text = 'Loading...' }: PageLoaderProps) {
  if (variant === 'card') {
    return (
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="w-full space-y-4"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/80 rounded-2xl border border-gray-200/80 p-6 overflow-hidden relative"
          >
            <div className="absolute inset-0 -translate-x-full overflow-hidden">
              <motion.div
                variants={shimmerVariants}
                animate="animate"
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            </div>
            <div className="h-3 bg-gray-200 rounded w-1/3 mb-3 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-2 animate-pulse" />
            <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse" />
          </div>
        ))}
      </motion.div>
    )
  }

  if (variant === 'minimal') {
    return (
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="flex items-center justify-center py-12"
      >
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">{text}</span>
        </div>
      </motion.div>
    )
  }

  // Fullscreen variant (default)
  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="flex items-center justify-center min-h-[60vh] px-4"
    >
      <div className="w-full max-w-lg space-y-6">
        {/* Pulsing logo */}
        <div className="flex justify-center mb-8">
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-cyan-500/20"
          >
            <span className="text-white font-bold text-xl">K</span>
          </motion.div>
        </div>

        {/* Skeleton cards */}
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 overflow-hidden relative"
            >
              {/* Shimmer overlay */}
              <div className="absolute inset-0 -translate-x-full overflow-hidden">
                <motion.div
                  variants={shimmerVariants}
                  animate="animate"
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
              </div>

              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <div className="h-3 bg-gray-200/80 rounded w-2/5 animate-pulse" />
                  <div className="h-7 bg-gray-200/80 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-200/80 rounded w-3/5 animate-pulse" />
                </div>
                <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Loading text */}
        <div className="flex items-center justify-center gap-2 text-gray-400 mt-4">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-medium">{text}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default PageLoader
