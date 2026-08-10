'use client';

import { PageLoader } from '@/components/PageLoader';
import { motion } from 'framer-motion';

export default function StoreLoading() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <PageLoader variant="card" text="Loading store profile..." />
    </motion.div>
  );
}
