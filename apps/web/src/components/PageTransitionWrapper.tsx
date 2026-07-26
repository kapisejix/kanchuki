'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

export const pageVariants = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.97,
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 0.2, 1],
    },
  },
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
}

interface PageTransitionWrapperProps {
  children?: ReactNode
  className?: string
  /** If true, children will have staggered entrance animation */
  staggered?: boolean
}

/**
 * PageTransitionWrapper — Smooth page transition animations.
 *
 * Wraps page children with entrance animation (fade + slide-up + scale)
 * and supports exit animation via variants. Wrap the usage site in an
 * AnimatePresence at a higher level (e.g., layout.tsx) to enable exit
 * animations during route changes.
 *
 * Optional staggered mode reveals children at 80ms intervals.
 */
export function PageTransitionWrapper({
  children,
  className = '',
  staggered = false,
}: PageTransitionWrapperProps) {
  if (staggered) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={className}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default PageTransitionWrapper
