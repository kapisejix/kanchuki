'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { X, Upload, Camera, Download, Check, Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  productName: string
  productPhotoUrl: string
  collectionSlug: string
  productId: string
  onClose: () => void
}

type Step = 'intro' | 'uploading' | 'processing' | 'result' | 'error'

export function TryOnModal({ productName, productPhotoUrl, collectionSlug, productId, onClose }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const [customerPhoto, setCustomerPhoto] = useState<string | null>(null)
  const [customerFile, setCustomerFile] = useState<File | null>(null)
  const [tryOnJobId, setTryOnJobId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Upload customer photo to temp storage ───────────────────────

  const uploadCustomerPhoto = useCallback(async (file: File): Promise<string> => {
    // Use a free image hosting service or upload directly
    // For MVP, we use a simple approach: read as data URL and pass to backend
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // ── Handle photo selection ─────────────────────────────────────

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const previewUrl = URL.createObjectURL(file)
    setCustomerPhoto(previewUrl)
    setCustomerFile(file)
    setStep('uploading')

    try {
      // Upload photo as base64
      const photoDataUrl = await uploadCustomerPhoto(file)

      // Initiate try-on with the data URL
      setStep('processing')

      const res = await fetch('/api/try-on/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_slug: collectionSlug,
          product_id: productId,
          customer_photo_url: photoDataUrl,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: { message: 'Try-on failed' } }))
        throw new Error(errData.error?.message ?? 'Try-on service unavailable')
      }

      const { data } = await res.json() as { data: { id: string; status: string } }

      setTryOnJobId(data.id)

      // Poll for result
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/try-on/remote/${data.id}`)
          if (!pollRes.ok) {
            clearInterval(pollInterval)
            throw new Error('Failed to check status')
          }
          const pollData = await pollRes.json() as {
            data: {
              status: string
              result_url: string | null
              error_message: string | null
            }
          }

          if (pollData.data.status === 'COMPLETED' && pollData.data.result_url) {
            clearInterval(pollInterval)
            setResultUrl(pollData.data.result_url)
            setStep('result')
          } else if (pollData.data.status === 'FAILED') {
            clearInterval(pollInterval)
            setErrorMessage(pollData.data.error_message ?? 'Try-on failed')
            setStep('error')
          }
        } catch {
          clearInterval(pollInterval)
          setErrorMessage('Failed to check try-on status')
          setStep('error')
        }
      }, 2000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Try-on failed')
      setStep('error')
    }
  }, [collectionSlug, productId, uploadCustomerPhoto])

  // ── Handle retry ───────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setCustomerPhoto(null)
    setCustomerFile(null)
    setTryOnJobId(null)
    setResultUrl(null)
    setErrorMessage(null)
    setStep('intro')
  }, [])

  // ── Share / Save result ────────────────────────────────────────

  const handleSaveImage = useCallback(() => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `tryon-${productId}.jpg`
    a.click()
  }, [resultUrl, productId])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative mt-auto bg-white rounded-t-3xl max-h-[95vh] overflow-y-auto w-full max-w-md mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white z-10">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* ── Intro Step ── */}
        {step === 'intro' && (
          <div className="px-6 pb-8 pt-2">
            <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Camera size={28} className="text-violet-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center">Try This On</h2>
            <p className="text-sm text-gray-500 text-center mt-1 px-4">
              Upload your photo to see how this outfit looks on you
            </p>

            {/* Product preview */}
            <div className="mt-4 bg-gray-50 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-16 h-20 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
                {productPhotoUrl && (
                  <Image
                    src={productPhotoUrl}
                    alt={productName}
                    width={64}
                    height={80}
                    className="object-cover w-full h-full"
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{productName}</p>
                <p className="text-xs text-gray-400">Virtual try-on preview</p>
              </div>
            </div>

            {/* Upload button */}
            <div className="mt-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold
                           py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                <Upload size={18} />
                Upload Your Photo
              </button>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-gray-400 text-center mt-4 px-4 leading-5">
              Your photo is used only to generate this try-on preview. 
              It is not stored permanently and is deleted after processing.
            </p>
          </div>
        )}

        {/* ── Uploading Step ── */}
        {step === 'uploading' && (
          <div className="px-6 pb-8 pt-4 text-center">
            <div className="flex justify-center mb-4">
              {customerPhoto && (
                <div className="w-32 h-40 rounded-2xl overflow-hidden border-2 border-violet-300">
                  <Image
                    src={customerPhoto}
                    alt="Your photo"
                    width={128}
                    height={160}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
            </div>
            <Loader2 size={24} className="animate-spin text-violet-600 mx-auto mb-3" />
            <p className="text-sm text-gray-700 font-medium">Preparing your photo...</p>
          </div>
        )}

        {/* ── Processing Step ── */}
        {step === 'processing' && (
          <div className="px-6 pb-8 pt-4 text-center">
            <div className="flex justify-center gap-4 mb-4">
              {customerPhoto && (
                <div className="w-24 h-32 rounded-xl overflow-hidden border border-gray-200 opacity-60">
                  <Image
                    src={customerPhoto}
                    alt="Your photo"
                    width={96}
                    height={128}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
              {productPhotoUrl && (
                <div className="w-24 h-32 rounded-xl overflow-hidden border border-gray-200 opacity-60">
                  <Image
                    src={productPhotoUrl}
                    alt="Product"
                    width={96}
                    height={128}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
            </div>
            <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Loader2 size={24} className="animate-spin text-violet-600" />
            </div>
            <p className="text-sm text-gray-700 font-medium">AI is generating your try-on...</p>
            <p className="text-xs text-gray-400 mt-1">This takes about 10-20 seconds</p>
            <div className="mt-4 w-48 h-1.5 bg-gray-100 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-violet-600 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {/* ── Result Step ── */}
        {step === 'result' && (
          <div className="px-6 pb-8 pt-2">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-base font-bold text-gray-900">Your Try-On is Ready!</p>
            </div>

            {/* Side by side */}
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 font-medium mb-1 uppercase tracking-wide">Original</p>
                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100">
                  {customerPhoto && (
                    <Image
                      src={customerPhoto}
                      alt="Your photo"
                      width={200}
                      height={266}
                      className="object-cover w-full h-full"
                    />
                  )}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-violet-600 font-medium mb-1 uppercase tracking-wide">Try-On ✨</p>
                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 ring-2 ring-violet-300">
                  {resultUrl && (
                    <Image
                      src={resultUrl}
                      alt="Try-on result"
                      width={200}
                      height={266}
                      className="object-cover w-full h-full"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 space-y-3">
              <button
                onClick={handleSaveImage}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold
                           py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={18} />
                Save Image
              </button>
              <button
                onClick={handleRetry}
                className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-medium
                           py-3.5 rounded-2xl transition-colors"
              >
                Try Another Outfit
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center mt-3">
              Try-on preview expires in 24 hours. Your uploaded photo was not stored.
            </p>
          </div>
        )}

        {/* ── Error Step ── */}
        {step === 'error' && (
          <div className="px-6 pb-8 pt-4 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <p className="text-base font-bold text-gray-900">Something went wrong</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage ?? 'Try-on failed. Please try again.'}</p>

            <div className="mt-6 space-y-3">
              <button
                onClick={handleRetry}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold
                           py-3.5 rounded-2xl transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="w-full border-2 border-gray-200 text-gray-700 font-medium
                           py-3.5 rounded-2xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
