// F-015: shown instead of CollectionView when the retailer is suspended —
// the API only sends { suspended: true, retailer: { shop_name, public_slug } }
// in that case, so this must not read any other collection/retailer field.
export function SuspendedNotice({ shopName }: { shopName: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm">
        <h1 className="font-display text-xl font-bold text-gray-900 mb-2">
          {shopName} is temporarily unavailable
        </h1>
        <p className="text-sm text-gray-500">
          This store link isn&apos;t active right now. Please contact the store directly for
          assistance.
        </p>
      </div>
    </div>
  )
}
