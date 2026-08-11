'use client'

import Image from 'next/image'

// Store logo, or a tasteful placeholder monogram (first letter of the shop
// name) — never a fake logo image (docs/content honesty gate). Shared by the
// /stores directory cards and the homepage store teaser.
export default function StoreLogo({ shopName, logoUrl }: { shopName: string; logoUrl: string | null }) {
  if (logoUrl) {
    return <Image src={logoUrl} alt={`${shopName} logo`} width={64} height={64} className="w-full h-full object-cover" />
  }
  return (
    <div className="w-full h-full bg-ink-600 flex items-center justify-center text-white font-display text-3xl font-semibold">
      {shopName.trim().charAt(0).toUpperCase() || 'S'}
    </div>
  )
}
