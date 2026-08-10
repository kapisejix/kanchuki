'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  HelpCircle,
  IndianRupee,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

// ─── Inner component (wrapped in Suspense per Next.js 14 useSearchParams rule) ─

function StatusContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const isSuccess = status === 'success';

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sand-50 via-cotton to-sand-100 flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-sand-200/80 shadow-xl shadow-ink-900/5 overflow-hidden">
          {/* Top accent bar */}
          <div
            className={`h-1.5 w-full ${
              isSuccess
                ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                : 'bg-gradient-to-r from-amber-400 to-rust-500'
            }`}
          />

          <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
            {/* Animated icon */}
            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="mx-auto mb-5"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25 mx-auto">
                    <CheckCircle2 size={44} className="text-white" />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="unknown"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="mx-auto mb-5"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-rust-500 flex items-center justify-center shadow-lg shadow-amber-500/25 mx-auto">
                    <HelpCircle size={44} className="text-white" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 10 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                  isSuccess
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {isSuccess ? (
                  <>
                    <Sparkles size={12} />
                    Payment Successful
                  </>
                ) : (
                  <>
                    <HelpCircle size={12} />
                    Status Unknown
                  </>
                )}
              </span>
            </motion.div>

            {/* Main message */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 10 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              <h1 className="text-xl sm:text-2xl font-bold text-ink-900 mt-4">
                {isSuccess ? 'Addon Purchased!' : "We're Not Sure"}
              </h1>
              <p className="text-sm text-ink-500 mt-2 leading-relaxed max-w-xs mx-auto">
                {isSuccess
                  ? 'Your addon units have been credited to your account. You can start using them right away.'
                  : "We couldn't confirm your purchase status. Your account may already be credited. If not, please contact support."}
              </p>
            </motion.div>

            {/* Details card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 16 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className={`mt-6 rounded-2xl border p-4 text-left ${
                isSuccess
                  ? 'bg-green-50/80 border-green-200/60'
                  : 'bg-amber-50/80 border-amber-200/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isSuccess ? 'bg-green-100' : 'bg-amber-100'
                  }`}
                >
                  <ShoppingCart
                    size={18}
                    className={isSuccess ? 'text-green-600' : 'text-amber-600'}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">Addon Purchase</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {isSuccess
                      ? 'Credited instantly — check your billing dashboard'
                      : 'Please verify in your billing dashboard'}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="px-6 sm:px-8 pb-8 space-y-3"
          >
            <a
              href="/billing"
              className="w-full bg-ink-600 hover:bg-ink-700 text-white text-sm font-semibold px-5 py-3 rounded-2xl transition-all shadow-lg shadow-ink-900/20 hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Billing
            </a>

            {!isSuccess && (
              <a
                href={
                  'mailto:support@kanchuki.app?subject=Addon Purchase Issue&body=Please check my recent addon purchase — I was redirected to an unknown status page.'
                }
                className="w-full bg-white hover:bg-sand-50 text-ink-700 text-sm font-medium px-5 py-3 rounded-2xl border border-sand-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <HelpCircle size={15} />
                Contact Support
              </a>
            )}
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="border-t border-sand-100 px-6 sm:px-8 py-4"
          >
            <div className="flex items-center justify-center gap-2 text-xs text-sand-400">
              <IndianRupee size={12} />
              <span>Secured by Razorpay</span>
              <span className="w-1 h-1 rounded-full bg-sand-300" />
              <span>Kanchuki</span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────

export default function AddonSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-gradient-to-br from-sand-50 via-cotton to-sand-100 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-rust-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <StatusContent />
    </Suspense>
  );
}
