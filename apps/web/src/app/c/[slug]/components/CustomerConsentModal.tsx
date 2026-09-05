'use client'

import { useState } from 'react'
import Image from 'next/image'
import { X, ArrowLeft, ShieldCheck, User, MessageSquare } from 'lucide-react'
import { formatPriceRange, buildWhatsAppEnquiryLink, buildEnquiryMessage } from '@kanchuki/shared'
import type { PublicProduct, PublicProductDetail, PublicCollection } from '@kanchuki/shared'

interface Props {
  product: PublicProduct | PublicProductDetail
  retailer: PublicCollection['retailer']
  collectionTitle: string
  // Canonical deep link to this product's shared page — embedded in the
  // WhatsApp enquiry message so the retailer can open the product in a tap.
  productUrl?: string
  onClose: () => void
}

export function CustomerConsentModal({
  product,
  retailer,
  collectionTitle,
  productUrl,
  onClose,
}: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consentWhatsApp, setConsentWhatsApp] = useState(true)
  const [consentVip, setConsentVip] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleContinue = () => {
    if (!consentWhatsApp) {
      setError('Please agree to WhatsApp communications to proceed.')
      return
    }
    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length > 0 && cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }

    // Save lead info locally if provided
    if (typeof window !== 'undefined' && cleanPhone) {
      try {
        localStorage.setItem(`kanchuki_lead_${retailer.public_slug ?? 'store'}`, JSON.stringify({
          name: name.trim() || 'Customer',
          phone: cleanPhone,
        }))
      } catch {}
    }

    // Build custom WhatsApp enquiry message
    const customMessage = buildEnquiryMessage({
      shopName: retailer.shop_name,
      collectionTitle,
      products: [
        {
          name: (product as any).name ?? null,
          price_min: (product as any).price_min ?? null,
          product_url: productUrl,
        },
      ],
    })

    const prefix = name.trim() ? `Hello, I am ${name.trim()}.\n\n` : ''
    const fullMessage = prefix + customMessage
    const url = buildWhatsAppEnquiryLink(retailer.phone, fullMessage)
    
    window.open(url, '_blank')
    onClose()
  }

  const primaryPhoto = (product as any).primary_photo_url || (product as any).photos?.[0] || null

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#F8F7FC] rounded-t-[32px] sm:rounded-[32px] p-5 pb-8 sm:p-6 shadow-2xl border border-[#E0E1F6] max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Navigation */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-[#231F48] shadow-sm border border-[#E0E1F6] hover:border-[#BB3F95] transition"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#231F48] to-[#560A39] text-white flex items-center justify-center font-serif font-bold text-xs shadow-sm">
              {retailer.shop_name.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs font-bold text-[#231F48] truncate max-w-[180px]">
              {retailer.shop_name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-[#231F48] shadow-sm border border-[#E0E1F6] hover:border-[#BB3F95] transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Header Title */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Boutique Direct Connect
            </span>
          </div>
          <h2 className="text-base leading-6 tracking-[0.02em] font-extrabold text-[#231F48] font-marcellus">
            Enquire on WhatsApp
          </h2>
          <p className="text-xs text-[#6B4773] mt-0.5 font-medium">
            Receive HD photos, price quotes, and fitting assistance directly from the store owner.
          </p>
        </div>

        {/* Selected Product Preview Summary Card */}
        <div className="p-3 bg-white rounded-[22px] border border-[#E0E1F6] mb-4 flex items-center gap-3 shadow-sm">
          <div className="w-14 h-16 rounded-xl overflow-hidden bg-[#FAF9FE] flex-shrink-0 border border-[#E0E1F6] relative">
            {primaryPhoto ? (
              <Image
                src={primaryPhoto}
                alt={product.name ?? product.category ?? 'Product'}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs">👗</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-1">
              <h4 className="text-xs font-bold text-[#231F48] truncate">
                {product.name ?? product.category ?? 'Outfit'}
              </h4>
              <span className="text-xs font-extrabold text-[#231F48] font-sans flex-shrink-0">
                {formatPriceRange(product.price_min, product.price_max)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-[#6B4773] font-medium bg-[#E0E1F6]/60 px-2 py-0.5 rounded-md">
                {product.subtype ?? product.category ?? 'Ethnic'}
              </span>
              {product.primary_color && (
                <span className="text-[10px] text-[#6B4773] font-medium bg-[#E0E1F6]/60 px-2 py-0.5 rounded-md">
                  {product.primary_color}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Customer Details Form */}
        <div className="p-4 bg-white rounded-[24px] border border-[#E0E1F6] space-y-3.5 mb-4 shadow-sm">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-extrabold text-[#6B4773] block mb-1">
              Your Full Name (Optional)
            </label>
            <div className="w-full bg-[#FAF9FE] rounded-2xl p-2.5 px-3.5 text-xs text-[#231F48] border border-[#E0E1F6] flex items-center gap-2.5 focus-within:border-[#231F48] focus-within:bg-white transition">
              <User size={15} className="text-[#928EB2]" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full bg-transparent text-xs text-[#231F48] font-semibold focus:outline-none placeholder-[#928EB2]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-extrabold text-[#6B4773] block mb-1">
              WhatsApp Mobile Number (Optional)
            </label>
            <div className="w-full bg-[#FAF9FE] rounded-2xl p-2.5 px-3.5 text-xs text-[#231F48] border border-[#E0E1F6] flex items-center gap-2.5 focus-within:border-[#231F48] focus-within:bg-white transition">
              <span className="text-xs font-bold text-[#231F48] flex items-center gap-1 border-r border-[#E0E1F6] pr-2.5">
                🇮🇳 +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (error) setError(null)
                }}
                maxLength={10}
                placeholder="98765 43210"
                className="w-full bg-transparent text-xs text-[#231F48] font-semibold tracking-wider focus:outline-none placeholder-[#928EB2]"
              />
            </div>
          </div>

          {/* Consent Checkboxes */}
          <div className="pt-2 space-y-2.5 border-t border-[#E0E1F6]/70">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="modal-consent-whatsapp"
                checked={consentWhatsApp}
                onChange={(e) => {
                  setConsentWhatsApp(e.target.checked)
                  if (error) setError(null)
                }}
                className="mt-0.5 w-4 h-4 rounded border-[#E0E1F6] text-[#231F48] focus:ring-0 cursor-pointer accent-[#231F48]"
              />
              <label
                htmlFor="modal-consent-whatsapp"
                className="text-[11px] text-[#231F48] leading-relaxed font-medium cursor-pointer"
              >
                I agree to receive product photos, pricing, and order updates on WhatsApp and accept Kanchuki&apos;s{' '}
                <a href="/privacy" target="_blank" className="text-[#BB3F95] font-bold underline">
                  Privacy Policy
                </a>{' '}
                and{' '}
                <a href="/terms" target="_blank" className="text-[#BB3F95] font-bold underline">
                  Terms of Service
                </a>
                .
              </label>
            </div>

            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="modal-consent-vip"
                checked={consentVip}
                onChange={(e) => setConsentVip(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[#E0E1F6] text-[#231F48] focus:ring-0 cursor-pointer accent-[#BB3F95]"
              />
              <label
                htmlFor="modal-consent-vip"
                className="text-[11px] text-[#6B4773] leading-relaxed font-medium cursor-pointer"
              >
                Send me new arrival alerts & exclusive festive coupon discounts.
              </label>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs font-semibold text-rose-600 mb-3 text-center">{error}</p>
        )}

        {/* Bottom CTA Button in Signature Gradient */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#231F48] to-[#560A39] text-white flex items-center justify-between shadow-lg shadow-[#231F48]/25 hover:shadow-xl transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                <MessageSquare size={16} className="fill-current text-white" />
              </div>
              <div className="text-left">
                <span className="text-xs font-extrabold uppercase tracking-wider text-white block">
                  Continue to WhatsApp
                </span>
                <span className="text-[9px] text-[#E0E1F6]/80 font-medium block">
                  Direct chat with store manager
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-xl bg-[#BB3F95] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              →
            </div>
          </button>

          {/* Trust Badge */}
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#6B4773] font-semibold">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>100% Privacy Protected • Direct Boutique Connect</span>
          </div>
        </div>
      </div>
    </div>
  )
}

