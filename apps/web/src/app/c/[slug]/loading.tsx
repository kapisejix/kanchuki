'use client'

import { motion } from 'framer-motion'
import { PageLoader } from '@/components/PageLoader'

export default function CollectionLoading() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageLoader variant="card" text="Loading collection..." />
    </motion.div>
  )
}
