'use client'

// Share actions for the design permalink — Web Share API when available,
// WhatsApp wa.me deep link, and copy-link. Mirrors the mobile design detail
// screen (docs/tasks/suits-designs.md §2.4): the permalink is the shareable
// artifact.
import { useState } from 'react'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'

interface Props {
  name: string
  permalink: string
  imageUrl: string
}

export function DesignShareActions({ name, permalink, imageUrl }: Props) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    // Web Share API — WhatsApp/other targets when the browser provides them.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: name, url: permalink })
        return
      } catch {
        // Dismissed by the user (AbortError) or unsupported payload — fall
        // through to copy-link so there is always an outcome.
      }
    }
    await handleCopy()
  }

  const handleWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${name} — ${permalink}`)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(permalink)
    } catch {
      // Clipboard unavailable (permission/secure-context) — last-resort
      // fallback keeps the action non-dead.
      const el = document.createElement('textarea')
      el.value = permalink
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  // imageUrl is kept for callers that want to attach the file later — the
  // current Web Share spec only guarantees url/text in most mobile browsers.
  void imageUrl

  return (
    <div className="mt-6 flex flex-col gap-2.5">
      <button
        onClick={() => void handleShare()}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#231F48] text-white text-sm font-bold shadow-lg shadow-[#231F48]/20 hover:bg-[#2E2957] transition-colors"
      >
        <Share2 size={17} />
        Share design
      </button>
      <div className="flex gap-2.5">
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#E0E1F6] text-[#231F48] text-sm font-bold shadow-sm hover:border-[#25D366]/50 transition-colors"
        >
          <MessageCircle size={17} className="text-[#25D366]" />
          WhatsApp
        </button>
        <button
          onClick={() => void handleCopy()}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#E0E1F6] text-[#231F48] text-sm font-bold shadow-sm hover:border-[#BB3F95] transition-colors"
        >
          {copied ? <Check size={17} className="text-emerald-500" /> : <Copy size={17} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
