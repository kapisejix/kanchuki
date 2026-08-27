import type {
  ProductDetail,
  ProductPhotoItem,
  ProductVariantItem,
  ProductStatus,
} from '@kanchuki/shared'

export type Photo = ProductPhotoItem
export type Variant = ProductVariantItem
export type Product = ProductDetail

export const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NOT_SURE', label: 'Not Sure' },
]
