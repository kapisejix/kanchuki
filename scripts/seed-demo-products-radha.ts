/**
 * Seed 12 dummy products in each of 4 categories (Ladies Suits, Teenager,
 * Men, Kids) for the demo retailer Radha Clothing Store (phone 9876543210),
 * so the app has real content to browse/test against.
 *
 * Photos use public placeholder images (picsum.photos) — no real R2 upload,
 * fine for UI/feature testing but not for anything needing real garment photos.
 *
 * Usage: node --env-file=apps/api/.env --import tsx scripts/seed-demo-products-radha.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RETAILER_PHONE = '9876543210'

type DummyItem = {
  name: string
  subtype: string
  color: string
  fabric: string
  pattern: string
  priceMin: number // rupees
  priceMax: number
  mrp: number
  sizes: string[]
}

const LADIES_SUITS: DummyItem[] = [
  { name: 'Anarkali Suit - Emerald Green', subtype: 'Anarkali Suit', color: 'Emerald Green', fabric: 'Georgette', pattern: 'Embroidered', priceMin: 2200, priceMax: 2200, mrp: 2800, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Straight-Cut Salwar Suit - Dusty Pink', subtype: 'Salwar Suit', color: 'Dusty Pink', fabric: 'Cotton', pattern: 'Printed', priceMin: 1500, priceMax: 1500, mrp: 1900, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Palazzo Suit Set - Mustard Yellow', subtype: 'Palazzo Suit', color: 'Mustard Yellow', fabric: 'Rayon', pattern: 'Solid', priceMin: 1800, priceMax: 1800, mrp: 2200, sizes: ['M', 'L', 'XL'] },
  { name: 'Sharara Suit - Royal Blue', subtype: 'Sharara Suit', color: 'Royal Blue', fabric: 'Silk Blend', pattern: 'Embellished', priceMin: 3200, priceMax: 3200, mrp: 4000, sizes: ['S', 'M', 'L'] },
  { name: 'Cotton Printed Suit - Sea Green', subtype: 'Kurta Set', color: 'Sea Green', fabric: 'Cotton', pattern: 'Floral Print', priceMin: 1400, priceMax: 1400, mrp: 1700, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Georgette Party Suit - Wine Red', subtype: 'Suit with Dupatta', color: 'Wine Red', fabric: 'Georgette', pattern: 'Sequinned', priceMin: 2800, priceMax: 2800, mrp: 3500, sizes: ['M', 'L', 'XL'] },
  { name: 'Patiala Suit - Turquoise', subtype: 'Patiala Suit', color: 'Turquoise', fabric: 'Cotton', pattern: 'Solid', priceMin: 1600, priceMax: 1600, mrp: 2000, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Chikankari Suit - Ivory White', subtype: 'Kurta Set', color: 'Ivory White', fabric: 'Cotton', pattern: 'Chikankari', priceMin: 2500, priceMax: 2500, mrp: 3100, sizes: ['S', 'M', 'L'] },
  { name: 'Banarasi Silk Suit - Maroon', subtype: 'Suit with Dupatta', color: 'Maroon', fabric: 'Banarasi Silk', pattern: 'Woven', priceMin: 4200, priceMax: 4200, mrp: 5200, sizes: ['M', 'L', 'XL'] },
  { name: 'Angrakha Style Suit - Coral', subtype: 'Angrakha Suit', color: 'Coral', fabric: 'Muslin', pattern: 'Solid', priceMin: 2100, priceMax: 2100, mrp: 2600, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Punjabi Suit - Bottle Green', subtype: 'Punjabi Suit', color: 'Bottle Green', fabric: 'Cotton Silk', pattern: 'Phulkari', priceMin: 1900, priceMax: 1900, mrp: 2400, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Designer Suit with Dupatta - Peach', subtype: 'Suit with Dupatta', color: 'Peach', fabric: 'Net', pattern: 'Embroidered', priceMin: 3600, priceMax: 3600, mrp: 4500, sizes: ['M', 'L'] },
]

const TEENAGER: DummyItem[] = [
  { name: 'Denim Jacket & Tee Combo', subtype: 'Jacket Set', color: 'Blue', fabric: 'Denim', pattern: 'Solid', priceMin: 1800, priceMax: 1800, mrp: 2200, sizes: ['S', 'M', 'L'] },
  { name: 'Crop Top & Skirt Set', subtype: 'Co-ord Set', color: 'Baby Pink', fabric: 'Cotton Lycra', pattern: 'Solid', priceMin: 1200, priceMax: 1200, mrp: 1500, sizes: ['XS', 'S', 'M'] },
  { name: 'Graphic Print Hoodie', subtype: 'Hoodie', color: 'Black', fabric: 'Fleece', pattern: 'Graphic Print', priceMin: 1400, priceMax: 1400, mrp: 1800, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'High-Waist Jeans', subtype: 'Jeans', color: 'Dark Blue', fabric: 'Denim', pattern: 'Solid', priceMin: 1300, priceMax: 1300, mrp: 1600, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Floral Co-ord Set', subtype: 'Co-ord Set', color: 'Yellow', fabric: 'Rayon', pattern: 'Floral Print', priceMin: 1500, priceMax: 1500, mrp: 1900, sizes: ['S', 'M', 'L'] },
  { name: 'Oversized Sweatshirt', subtype: 'Sweatshirt', color: 'Grey', fabric: 'Cotton Fleece', pattern: 'Solid', priceMin: 1100, priceMax: 1100, mrp: 1400, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Pleated Mini Skirt', subtype: 'Skirt', color: 'Maroon', fabric: 'Polyester', pattern: 'Solid', priceMin: 900, priceMax: 900, mrp: 1200, sizes: ['XS', 'S', 'M'] },
  { name: 'Ripped Denim Jeans', subtype: 'Jeans', color: 'Light Blue', fabric: 'Denim', pattern: 'Distressed', priceMin: 1400, priceMax: 1400, mrp: 1750, sizes: ['S', 'M', 'L'] },
  { name: 'Printed Bomber Jacket', subtype: 'Jacket', color: 'Olive Green', fabric: 'Polyester', pattern: 'Printed', priceMin: 1700, priceMax: 1700, mrp: 2100, sizes: ['M', 'L', 'XL'] },
  { name: 'Tie-Dye T-Shirt', subtype: 'T-Shirt', color: 'Multicolor', fabric: 'Cotton', pattern: 'Tie-Dye', priceMin: 600, priceMax: 600, mrp: 800, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Cargo Pants', subtype: 'Cargo Pants', color: 'Beige', fabric: 'Cotton Twill', pattern: 'Solid', priceMin: 1300, priceMax: 1300, mrp: 1600, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Casual Jumpsuit', subtype: 'Jumpsuit', color: 'Teal', fabric: 'Rayon', pattern: 'Solid', priceMin: 1600, priceMax: 1600, mrp: 2000, sizes: ['S', 'M', 'L'] },
]

const MEN: DummyItem[] = [
  { name: 'Formal Cotton Shirt - White', subtype: 'Formal Shirt', color: 'White', fabric: 'Cotton', pattern: 'Solid', priceMin: 900, priceMax: 900, mrp: 1200, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Slim-Fit Chinos - Khaki', subtype: 'Chinos', color: 'Khaki', fabric: 'Cotton Twill', pattern: 'Solid', priceMin: 1100, priceMax: 1100, mrp: 1400, sizes: ['30', '32', '34', '36'] },
  { name: 'Kurta Pajama Set - Cream', subtype: 'Kurta Pajama', color: 'Cream', fabric: 'Cotton Silk', pattern: 'Solid', priceMin: 1600, priceMax: 1600, mrp: 2000, sizes: ['M', 'L', 'XL', 'XXL'] },
  { name: 'Nehru Jacket - Navy', subtype: 'Nehru Jacket', color: 'Navy Blue', fabric: 'Jacquard', pattern: 'Woven', priceMin: 1900, priceMax: 1900, mrp: 2400, sizes: ['M', 'L', 'XL'] },
  { name: 'Casual Denim Shirt - Light Blue', subtype: 'Casual Shirt', color: 'Light Blue', fabric: 'Denim', pattern: 'Solid', priceMin: 1000, priceMax: 1000, mrp: 1300, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Sherwani - Maroon', subtype: 'Sherwani', color: 'Maroon', fabric: 'Velvet', pattern: 'Embroidered', priceMin: 6500, priceMax: 6500, mrp: 8000, sizes: ['M', 'L', 'XL'] },
  { name: 'Polo T-Shirt - Grey', subtype: 'Polo T-Shirt', color: 'Grey', fabric: 'Cotton Pique', pattern: 'Solid', priceMin: 700, priceMax: 700, mrp: 900, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Formal Trousers - Black', subtype: 'Formal Trousers', color: 'Black', fabric: 'Polyester Blend', pattern: 'Solid', priceMin: 1200, priceMax: 1200, mrp: 1500, sizes: ['30', '32', '34', '36', '38'] },
  { name: 'Bandhgala Suit - Charcoal', subtype: 'Bandhgala Suit', color: 'Charcoal Grey', fabric: 'Wool Blend', pattern: 'Solid', priceMin: 5500, priceMax: 5500, mrp: 7000, sizes: ['M', 'L', 'XL'] },
  { name: 'Linen Shirt - Beige', subtype: 'Casual Shirt', color: 'Beige', fabric: 'Linen', pattern: 'Solid', priceMin: 1300, priceMax: 1300, mrp: 1600, sizes: ['S', 'M', 'L', 'XL'] },
  { name: 'Track Pants - Black', subtype: 'Track Pants', color: 'Black', fabric: 'Polyester', pattern: 'Solid', priceMin: 800, priceMax: 800, mrp: 1000, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Ethnic Kurta - Mustard', subtype: 'Kurta', color: 'Mustard', fabric: 'Cotton', pattern: 'Solid', priceMin: 1000, priceMax: 1000, mrp: 1300, sizes: ['M', 'L', 'XL', 'XXL'] },
]

const KIDS: DummyItem[] = [
  { name: 'Boys Printed T-Shirt', subtype: 'T-Shirt', color: 'Blue', fabric: 'Cotton', pattern: 'Printed', priceMin: 400, priceMax: 400, mrp: 550, sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'] },
  { name: 'Girls Frock Dress - Pink', subtype: 'Frock', color: 'Pink', fabric: 'Cotton', pattern: 'Floral Print', priceMin: 700, priceMax: 700, mrp: 900, sizes: ['2-3Y', '4-5Y', '6-7Y'] },
  { name: 'Kids Dungaree Set', subtype: 'Dungaree', color: 'Denim Blue', fabric: 'Denim', pattern: 'Solid', priceMin: 800, priceMax: 800, mrp: 1000, sizes: ['1-2Y', '2-3Y', '4-5Y'] },
  { name: 'Boys Ethnic Kurta Set', subtype: 'Kurta Set', color: 'Yellow', fabric: 'Cotton Silk', pattern: 'Solid', priceMin: 900, priceMax: 900, mrp: 1150, sizes: ['4-5Y', '6-7Y', '8-9Y'] },
  { name: 'Girls Party Gown', subtype: 'Gown', color: 'Purple', fabric: 'Net', pattern: 'Sequinned', priceMin: 1200, priceMax: 1200, mrp: 1600, sizes: ['4-5Y', '6-7Y', '8-9Y'] },
  { name: 'Kids Denim Jacket', subtype: 'Jacket', color: 'Blue', fabric: 'Denim', pattern: 'Solid', priceMin: 900, priceMax: 900, mrp: 1150, sizes: ['2-3Y', '4-5Y', '6-7Y'] },
  { name: 'Boys Shorts & Tee Combo', subtype: 'Co-ord Set', color: 'Green', fabric: 'Cotton', pattern: 'Printed', priceMin: 600, priceMax: 600, mrp: 800, sizes: ['2-3Y', '4-5Y', '6-7Y'] },
  { name: 'Girls Lehenga Choli - Mini', subtype: 'Lehenga Choli', color: 'Red', fabric: 'Silk Blend', pattern: 'Embroidered', priceMin: 1500, priceMax: 1500, mrp: 1900, sizes: ['4-5Y', '6-7Y', '8-9Y'] },
  { name: 'Kids Winter Sweater', subtype: 'Sweater', color: 'Maroon', fabric: 'Wool Blend', pattern: 'Solid', priceMin: 700, priceMax: 700, mrp: 900, sizes: ['2-3Y', '4-5Y', '6-7Y'] },
  { name: 'Boys Formal Shirt', subtype: 'Formal Shirt', color: 'White', fabric: 'Cotton', pattern: 'Solid', priceMin: 550, priceMax: 550, mrp: 700, sizes: ['4-5Y', '6-7Y', '8-9Y'] },
  { name: 'Girls Skirt & Top Set', subtype: 'Co-ord Set', color: 'Peach', fabric: 'Cotton', pattern: 'Solid', priceMin: 650, priceMax: 650, mrp: 850, sizes: ['2-3Y', '4-5Y', '6-7Y'] },
  { name: 'Kids Pajama Set', subtype: 'Pajama Set', color: 'Sky Blue', fabric: 'Cotton', pattern: 'Printed', priceMin: 450, priceMax: 450, mrp: 600, sizes: ['1-2Y', '2-3Y', '4-5Y'] },
]

const GROUPS: { category: string; items: DummyItem[] }[] = [
  { category: 'Ladies Suits', items: LADIES_SUITS },
  { category: 'Teenager', items: TEENAGER },
  { category: 'Men', items: MEN },
  { category: 'Kids', items: KIDS },
]

async function main() {
  const retailer = await prisma.retailer.findUnique({
    where: { phone: RETAILER_PHONE },
    select: { id: true, shop_name: true },
  })
  if (!retailer) {
    console.error(`Retailer with phone ${RETAILER_PHONE} not found.`)
    process.exit(1)
  }
  console.log(`Seeding demo products for ${retailer.shop_name} (${retailer.id})...\n`)

  // Existing "Salwar Suits" ProductCategory (LADIES segment) is a close-enough
  // merchandising bucket for the Ladies Suits dummy items — reuse it so they
  // show up in the storefront's "Shop by category" grid immediately.
  const salwarSuitsCategory = await prisma.productCategory.findFirst({
    where: { retailer_id: retailer.id, name: 'Salwar Suits' },
    select: { id: true },
  })

  let created = 0
  for (const group of GROUPS) {
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i]
      const sku = `DEMO-${group.category.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`
      const photoSeed = `${group.category}-${i}`.replace(/\s+/g, '-').toLowerCase()

      const product = await prisma.product.create({
        data: {
          retailer_id: retailer.id,
          name: item.name,
          sku,
          description: `${item.pattern} ${item.subtype.toLowerCase()} in ${item.color.toLowerCase()}, ${item.fabric.toLowerCase()} fabric. Demo listing for testing.`,
          price_min: item.priceMin * 100,
          price_max: item.priceMax * 100,
          mrp: item.mrp * 100,
          status: 'AVAILABLE',
          category: group.category,
          subtype: item.subtype,
          product_type: item.subtype,
          primary_color: item.color,
          fabric_estimate: item.fabric,
          pattern: item.pattern,
          sizes: item.sizes,
          search_tags: [group.category.toLowerCase(), item.color.toLowerCase(), item.subtype.toLowerCase()],
          ai_tagged: true,
          category_id: group.category === 'Ladies Suits' ? salwarSuitsCategory?.id ?? null : null,
        },
      })

      await prisma.productPhoto.create({
        data: {
          product_id: product.id,
          retailer_id: retailer.id,
          url: `https://picsum.photos/seed/${photoSeed}/800/1000`,
          r2_key: `demo/${product.id}.jpg`,
          is_primary: true,
          width: 800,
          height: 1000,
          ai_tagged: true,
        },
      })

      created++
    }
  }

  console.log(`Created ${created} demo products (12 per category x 4 categories) with placeholder photos.`)
}

main()
  .catch((e) => {
    console.error('Failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
