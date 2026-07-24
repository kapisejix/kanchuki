'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag, Trash2, Heart, CreditCard } from 'lucide-react'
import { formatPriceRange } from '@kanchuki/shared'
import { type CartItem, type CartMap, loadCart, saveCart, cartTotal, cartCount } from '../lib/cart'

interface Props {
  slug: string
  shopName: string
  checkoutEnabled: boolean
}

export function CartPage({ slug, shopName, checkoutEnabled }: Props) {
  const [cart, setCart] = useState<CartMap | null>(null)

  useEffect(() => {
    setCart(loadCart(slug))
  }, [slug])

  const updateCart = useCallback(
    (newCart: CartMap) => {
      setCart(newCart)
      saveCart(slug, newCart)
    },
    [slug],
  )

  const removeItem = useCallback(
    (id: string) => {
      if (!cart) return
      const next = new Map(cart)
      next.delete(id)
      updateCart(next)
    },
    [cart, updateCart],
  )

  const clearCart = useCallback(() => {
    updateCart(new Map())
  }, [updateCart])

  if (cart === null) return null

  const items = Array.from(cart.values())
  const total = cartTotal(cart)
  const itemCount = cartCount(cart)

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center gap-3">
          <Link
            href={`/c/${slug}`}
            className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Back to catalog"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-display text-lg font-bold text-gray-900">
            Cart {itemCount > 0 && `(${itemCount})`}
          </h1>
          {itemCount > 0 && (
            <button
              onClick={clearCart}
              className="ml-auto text-xs font-semibold text-red-400 hover:text-red-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-3 py-4">
        {itemCount === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-50 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag size={26} className="text-cyan-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Your cart is empty</p>
            <p className="text-xs text-gray-400 mb-4">Add products from the collection to start checkout.</p>
            <Link
              href={`/c/${slug}`}
              className="inline-block text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-sm font-semibold px-4 py-2 rounded-full transition-colors"
            >
              Browse catalog
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100 flex gap-3 p-3">
                  <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
                    {item.primary_photo_url ? (
                      <Image
                        src={item.primary_photo_url}
                        alt={item.name ?? item.category ?? 'Product'}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Heart size={20} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name ?? item.category ?? 'Product'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.category}</p>
                    <p className="font-display text-sm font-bold tabular-nums text-gray-900 mt-1">{formatPriceRange(item.price_min, null)}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="self-start p-2 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    aria-label={`Remove ${item.name ?? 'item'} from cart`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-medium tabular-nums">{formatPriceRange(total, null)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>GST</span>
                <span className="font-medium tabular-nums">Calculated at checkout</span>
              </div>
              <hr className="border-gray-100" />
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Estimated Total</span>
                <span className="tabular-nums">{formatPriceRange(total, null)}</span>
              </div>
            </div>

            {checkoutEnabled ? (
              <Link
                href={`/c/${slug}/checkout`}
                className="mt-4 w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-soft-lg transition-all active:scale-[0.98] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
              >
                <CreditCard size={20} />
                Proceed to Checkout
              </Link>
            ) : (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                <p className="text-sm text-amber-700 font-medium">{shopName} does not accept online payments yet.</p>
                <p className="text-xs text-amber-600 mt-1">Enquire via WhatsApp to place an order.</p>
                <Link href={`/c/${slug}`} className="mt-3 inline-block text-sm font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-4 py-2 rounded-full transition-colors">
                  Back to catalog
                </Link>
              </div>
            )}
          </>
        )}
      </main>
      <div className="h-8" />
    </div>
  )
}
