export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">You&apos;re offline</h1>
      <p className="text-gray-500 mb-4">
        No internet connection. If you&apos;ve visited this collection before, try refreshing —
        your device may have a cached copy.
      </p>
      <p className="text-sm text-gray-400">Products you&apos;ve favorited are still saved on your device.</p>
    </div>
  )
}
