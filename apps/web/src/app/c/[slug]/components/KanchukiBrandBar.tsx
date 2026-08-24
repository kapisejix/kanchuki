import Image from 'next/image'

// Small Kanchuki wordmark strip shown above every customer-facing header
// (catalog, cart, checkout, wishlist, orders, shared-product link) so the
// platform brand stays visible no matter which screen a customer lands on.
export function KanchukiBrandBar() {
  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-1 flex justify-center">
      <Image
        src="/kanchuki-logo.png"
        alt="Kanchuki"
        width={100}
        height={20}
        className="h-4 w-auto opacity-60"
        priority
      />
    </div>
  )
}
