import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ────────────────────────────────────────────────────────

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

function placeholderUrl(category: string, color: string, idx: number): string {
  return `https://picsum.photos/seed/${slugify(category)}-${color}-${idx}/400/500`
}

// ── Template data ──────────────────────────────────────────────────

const CITIES = ['Delhi', 'Jaipur', 'Surat', 'Mumbai', 'Ahmedabad', 'Lucknow', 'Chennai', 'Kolkata']
const STATES = ['Delhi', 'Rajasthan', 'Gujarat', 'Maharashtra', 'Uttar Pradesh', 'Tamil Nadu', 'West Bengal']
const COLORS = ['Red', 'Blue', 'Green', 'Pink', 'Gold', 'White', 'Black', 'Purple', 'Orange', 'Teal', 'Maroon', 'Navy', 'Peach', 'Mint', 'Coral']
const FABRICS = ['Cotton', 'Silk', 'Georgette', 'Chiffon', 'Net', 'Organza', 'Rayon', 'Linen', 'Satin', 'Chanderi', 'Crepe', 'Modal']
const PATTERNS = ['Plain', 'Printed', 'Embroidered', 'Block Print', 'Bandhani', 'Chikankari', 'Phulkari', 'Woven', 'Checked', 'Striped']
const OCCASIONS = ['Casual', 'Office Wear', 'Party Wear', 'Wedding', 'Festive', 'Sangeet', 'Daily Wear', 'Special Occasion']
const EMBELLISHMENTS = ['Zari Work', 'Zardozi', 'Gota Patti', 'Mirror Work', 'Sequin', 'Stone Work', 'Resham Embroidery', 'Thread Work', 'None']
const NECK_STYLES = ['Round Neck', 'V-Neck', 'Boat Neck', 'High Neck', 'Square Neck', 'Sweetheart', 'Keyhole', 'Collared']
const SLEEVE_TYPES = ['Full Sleeve', 'Three-Quarter', 'Half Sleeve', 'Short Sleeve', 'Sleeveless', 'Cap Sleeve', 'Bell Sleeve', 'Bishop Sleeve']

// ── Main Seed ──────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...\n')

  // Clean existing data (reverse dependency order for FK safety)
  console.log('  Cleaning existing data...')
  await prisma.collectionEnquiry.deleteMany()
  await prisma.collectionView.deleteMany()
  await prisma.collectionProduct.deleteMany()
  await prisma.collection.deleteMany()
  await prisma.customerInteraction.deleteMany()
  await prisma.customerFashionDNA.deleteMany()
  await prisma.customerMeasurement.deleteMany()
  await prisma.tryOnJob.deleteMany()
  await prisma.subscriptionPayment.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.productEmbedding.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.productPhoto.deleteMany()
  await prisma.storeSection.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.product.deleteMany()
  await prisma.retailer.deleteMany()
  await prisma.auditLog.deleteMany()

  // ── Retailer 1: Shree Laxmi Sarees ────────────────────────────
  const r1 = await createRetailer({
    shop_name: 'Shree Laxmi Sarees', owner_name: 'Rajesh Gupta',
    phone: '9810012345', city: 'Delhi', state: 'Delhi',
    categories: ['Saree', 'Ladies Suit', 'Kurti'],
    plan: 'GROWTH', plan_status: 'ACTIVE',
    sections: [
      { name: 'Rack A — Silk Sarees', type: 'rack' },
      { name: 'Rack B — Cotton Sarees', type: 'rack' },
      { name: 'Rack C — Ladies Suits', type: 'rack' },
      { name: 'Rack D — Kurtis & Tops', type: 'rack' },
    ],
  })

  // Products for R1
  const r1Products = await createProducts(r1.id, r1.sectionIds, [
    { name: 'Banarasi Silk Saree — Red & Gold', category: 'Saree', product_type: 'Readymade', primary_color: 'Red', secondary_colors: ['Gold'], fabric_estimate: 'Silk', pattern: 'Embroidered', embellishments: ['Zari Work', 'Zardozi'], neck_style: 'Boat Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Festive', 'Sangeet'], search_tags: ['banarasi', 'silk', 'bridal', 'heavy work'], price_min: 850000, price_max: 850000, mrp: 1200000, status: 'AVAILABLE', location_notes: 'Rack A · Row 2 · Stack 1', variants: [{ color: 'Gold' }, { color: 'Green' }] },
    { name: 'Kanjivaram Silk Saree — Navy Blue', category: 'Saree', product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['Gold'], fabric_estimate: 'Silk', pattern: 'Woven', embellishments: ['Zari Work'], neck_style: 'Boat Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Party Wear', 'Festive'], search_tags: ['kanjivaram', 'silk', 'bridal'], price_min: 650000, price_max: 650000, mrp: 900000, status: 'AVAILABLE', location_notes: 'Rack A · Row 1 · Stack 3', variants: [{ color: 'Purple' }] },
    { name: 'Cotton Printed Saree — Pink', category: 'Saree', product_type: 'Readymade', primary_color: 'Pink', secondary_colors: ['White'], fabric_estimate: 'Cotton', pattern: 'Printed', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Half Sleeve', occasions: ['Casual', 'Daily Wear', 'Office Wear'], search_tags: ['cotton', 'printed', 'daily wear'], price_min: 89500, price_max: 89500, mrp: 149500, status: 'AVAILABLE', location_notes: 'Rack B · Row 3 · Stack 2', variants: [{ color: 'Blue' }, { color: 'Green' }, { color: 'Orange' }] },
    { name: 'Georgette Saree — Mint Green', category: 'Saree', product_type: 'Readymade', primary_color: 'Mint', secondary_colors: ['Silver'], fabric_estimate: 'Georgette', pattern: 'Embroidered', embellishments: ['Sequin', 'Stone Work'], neck_style: 'V-Neck', sleeve_type: 'Three-Quarter', occasions: ['Party Wear', 'Festive', 'Sangeet'], search_tags: ['georgette', 'party wear', 'sequin'], price_min: 295000, price_max: 295000, mrp: 450000, status: 'RESERVED', location_notes: 'Rack B · Row 1 · Stack 1', variants: [{ color: 'Peach' }] },
    { name: 'Chiffon Saree — Maroon', category: 'Saree', product_type: 'Readymade', primary_color: 'Maroon', secondary_colors: ['Gold'], fabric_estimate: 'Chiffon', pattern: 'Embroidered', embellishments: ['Gota Patti', 'Thread Work'], neck_style: 'Boat Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Festive', 'Party Wear'], search_tags: ['chiffon', 'maroon', 'gota patti'], price_min: 395000, price_max: 395000, mrp: 550000, status: 'AVAILABLE', location_notes: 'Rack B · Row 2 · Stack 1', variants: [{ color: 'Gold' }] },
    { name: 'Organza Saree — Peach & Silver', category: 'Saree', product_type: 'Readymade', primary_color: 'Peach', secondary_colors: ['Silver'], fabric_estimate: 'Organza', pattern: 'Embroidered', embellishments: ['Zari Work', 'Stone Work'], neck_style: 'High Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Sangeet'], search_tags: ['organza', 'bridal', 'peach'], price_min: 550000, price_max: 550000, mrp: 750000, status: 'SOLD', location_notes: 'Rack A · Row 3 · Stack 1', variants: [] },
    { name: 'Ladies Suit — Navy Blue Chikankari', category: 'Ladies Suit', product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['White'], fabric_estimate: 'Cotton', pattern: 'Chikankari', embellishments: ['Thread Work'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Casual', 'Festive'], search_tags: ['chikankari', 'lucknowi', 'cotton suit'], price_min: 245000, price_max: 245000, mrp: 350000, status: 'AVAILABLE', location_notes: 'Rack C · Row 1 · Stack 2', variants: [{ color: 'White' }, { color: 'Pink' }] },
    { name: 'Patiala Suit — Bright Pink', category: 'Ladies Suit', product_type: 'Readymade', primary_color: 'Pink', secondary_colors: ['Gold'], fabric_estimate: 'Georgette', pattern: 'Embroidered', embellishments: ['Sequin', 'Resham Embroidery'], neck_style: 'V-Neck', sleeve_type: 'Three-Quarter', occasions: ['Party Wear', 'Sangeet'], search_tags: ['patiala suit', 'punjabi', 'pink'], price_min: 325000, price_max: 325000, mrp: 450000, status: 'AVAILABLE', location_notes: 'Rack C · Row 2 · Stack 1', variants: [{ color: 'Yellow' }, { color: 'Orange' }] },
    { name: 'Anarkali Suit — Teal Green', category: 'Ladies Suit', product_type: 'Readymade', primary_color: 'Teal', secondary_colors: ['Gold'], fabric_estimate: 'Chiffon', pattern: 'Embroidered', embellishments: ['Gota Patti', 'Stone Work'], neck_style: 'Keyhole', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Party Wear'], search_tags: ['anarkali', 'floor length', 'teal'], price_min: 495000, price_max: 495000, mrp: 650000, status: 'AVAILABLE', location_notes: 'Rack C · Row 3 · Stack 1', variants: [{ color: 'Maroon' }] },
    { name: 'Straight Cut Suit — Coral Pink', category: 'Ladies Suit', product_type: 'Readymade', primary_color: 'Coral', secondary_colors: ['White'], fabric_estimate: 'Rayon', pattern: 'Printed', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Half Sleeve', occasions: ['Office Wear', 'Casual', 'Daily Wear'], search_tags: ['straight cut', 'rayon', 'coral'], price_min: 149500, price_max: 149500, mrp: 225000, status: 'AVAILABLE', location_notes: 'Rack C · Row 4 · Stack 2', variants: [{ color: 'Blue' }, { color: 'Black' }] },
    { name: 'Cotton Kurti — White Block Print', category: 'Kurti', product_type: 'Readymade', primary_color: 'White', secondary_colors: ['Blue'], fabric_estimate: 'Cotton', pattern: 'Block Print', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Half Sleeve', occasions: ['Casual', 'Daily Wear'], search_tags: ['cotton kurti', 'block print', 'white'], price_min: 79500, price_max: 79500, mrp: 129500, status: 'AVAILABLE', location_notes: 'Rack D · Row 1 · Stack 3', variants: [{ color: 'Blue' }, { color: 'Pink' }] },
    { name: 'Embroidered Kurti — Navy Blue', category: 'Kurti', product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['Gold'], fabric_estimate: 'Georgette', pattern: 'Embroidered', embellishments: ['Resham Embroidery'], neck_style: 'V-Neck', sleeve_type: 'Three-Quarter', occasions: ['Party Wear', 'Festive'], search_tags: ['georgette kurti', 'embroidered', 'navy'], price_min: 195000, price_max: 195000, mrp: 295000, status: 'AVAILABLE', location_notes: 'Rack D · Row 2 · Stack 1', variants: [{ color: 'Green' }] },
    { name: 'Cotton Dupatta — Yellow Bandhani', category: 'Dupatta', product_type: 'Readymade', primary_color: 'Yellow', secondary_colors: ['Red'], fabric_estimate: 'Cotton', pattern: 'Bandhani', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Casual', 'Festive'], search_tags: ['dupatta', 'bandhani', 'cotton', 'yellow'], price_min: 49500, price_max: 49500, mrp: 89500, status: 'AVAILABLE', location_notes: 'Rack D · Row 3 · Stack 2', variants: [{ color: 'Pink' }] },
  ])

  const r1Customers = await createCustomers(r1.id, [
    { name: 'Priya Sharma', phone: '9876543210', pref_colors: ['Pink', 'Red', 'Gold'], pref_styles: ['Anarkali', 'Lehenga'], pref_fabrics: ['Silk', 'Georgette'], pref_occasions: ['Wedding', 'Party Wear'], budget_min: 300000, budget_max: 1000000, total_purchases: 3, total_spent: 1850000 },
    { name: 'Anita Verma', phone: '9876543211', pref_colors: ['Blue', 'Green', 'White'], pref_styles: ['Straight Cut', 'Kurti'], pref_fabrics: ['Cotton', 'Rayon'], pref_occasions: ['Office Wear', 'Casual'], budget_min: 50000, budget_max: 300000, total_purchases: 5, total_spent: 895000 },
    { name: 'Sunita Patel', phone: '9876543212', pref_colors: ['Maroon', 'Orange', 'Gold'], pref_styles: ['Saree', 'Lehenga'], pref_fabrics: ['Silk', 'Chiffon'], pref_occasions: ['Wedding', 'Festive', 'Sangeet'], budget_min: 500000, budget_max: 2000000, total_purchases: 2, total_spent: 1200000 },
    { name: 'Neha Gupta', phone: '9876543213', pref_colors: ['Peach', 'Mint', 'Purple'], pref_styles: ['Kurti', 'Suit'], pref_fabrics: ['Cotton', 'Georgette'], pref_occasions: ['Casual', 'Party Wear'], budget_min: 100000, budget_max: 500000, total_purchases: 4, total_spent: 980000 },
    { name: 'Kavita Joshi', phone: '9876543214', pref_colors: ['Red', 'Navy', 'Gold'], pref_styles: ['Saree', 'Gown'], pref_fabrics: ['Silk', 'Organza'], pref_occasions: ['Wedding', 'Sangeet'], budget_min: 800000, budget_max: 3000000, total_purchases: 1, total_spent: 850000 },
  ])

  await createInteractions(r1.id, r1Products, r1Customers)
  await createCollections(r1.id, r1, r1Products, r1Customers, [
    { title: 'Wedding Collection — June 2026', description: 'Perfect outfits for the wedding season.', product_indices: [0, 1, 4, 8, 12], customer_index: 0 },
    { title: 'Office Wear Essentials', description: 'Comfortable outfits for everyday office wear.', product_indices: [2, 9, 10, 11], customer_index: 1 },
    { title: 'Party Wear Specials', description: 'Stand out at every party.', product_indices: [3, 6, 7, 11] },
    { title: 'Summer Cotton Collection', description: 'Light and breathable cotton outfits.', product_indices: [2, 6, 10, 13] },
  ])

  // ── Retailer 2: Royal Men's Wear ───────────────────────────────
  const r2 = await createRetailer({
    shop_name: "Royal Men's Wear", owner_name: 'Vikram Singh',
    phone: '9820012345', city: 'Jaipur', state: 'Rajasthan',
    categories: ["Men's Kurta Pajama", 'Sherwani', 'Other'],
    plan: 'STARTER', plan_status: 'ACTIVE',
    sections: [
      { name: 'Rack A — Sherwanis', type: 'rack' },
      { name: 'Rack B — Kurta Pajamas', type: 'rack' },
      { name: 'Rack C — Indo-Western', type: 'rack' },
    ],
  })

  const r2Products = await createProducts(r2.id, r2.sectionIds, [
    { name: 'Beige Sherwani Gold Embroidery', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Beige', secondary_colors: ['Gold'], fabric_estimate: 'Silk', pattern: 'Embroidered', embellishments: ['Zari Work', 'Resham Embroidery'], neck_style: 'Collared', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Sangeet'], search_tags: ['sherwani', 'beige', 'wedding'], price_min: 1250000, price_max: 1250000, mrp: 1800000, status: 'AVAILABLE', location_notes: 'Rack A · Row 1 · Stack 1', variants: [{ color: 'Ivory' }, { color: 'Navy' }] },
    { name: 'Navy Indo-Western Jacket', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['Silver'], fabric_estimate: 'Linen', pattern: 'Embroidered', embellishments: ['Zari Work', 'Stone Work'], neck_style: 'Collared', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Party Wear'], search_tags: ['indo western', 'jacket', 'navy'], price_min: 650000, price_max: 650000, mrp: 950000, status: 'AVAILABLE', location_notes: 'Rack C · Row 1 · Stack 2', variants: [{ color: 'Black' }] },
    { name: 'White Cotton Kurta Pajama Set', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'White', secondary_colors: ['White'], fabric_estimate: 'Cotton', pattern: 'Plain', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Casual', 'Festive', 'Daily Wear'], search_tags: ['white kurta', 'cotton', 'daily wear'], price_min: 149500, price_max: 149500, mrp: 225000, status: 'AVAILABLE', location_notes: 'Rack B · Row 1 · Stack 1', variants: [{ color: 'Blue' }, { color: 'Black' }] },
    { name: 'Maroon Kurta Pajama Festive', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Maroon', secondary_colors: ['Gold'], fabric_estimate: 'Rayon', pattern: 'Embroidered', embellishments: ['Thread Work'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Festive', 'Party Wear'], search_tags: ['maroon kurta', 'festive', 'embroidery'], price_min: 245000, price_max: 245000, mrp: 350000, status: 'AVAILABLE', location_notes: 'Rack B · Row 2 · Stack 1', variants: [{ color: 'Green' }, { color: 'Navy' }] },
    { name: 'Black Pathani Suit', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Black', secondary_colors: ['Black'], fabric_estimate: 'Cotton', pattern: 'Plain', embellishments: ['None'], neck_style: 'Collared', sleeve_type: 'Full Sleeve', occasions: ['Casual', 'Party Wear'], search_tags: ['pathani', 'black', 'cotton'], price_min: 195000, price_max: 195000, mrp: 295000, status: 'AVAILABLE', location_notes: 'Rack B · Row 3 · Stack 2', variants: [{ color: 'White' }] },
    { name: 'Silk Kurta Royal Blue', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Blue', secondary_colors: ['Gold'], fabric_estimate: 'Silk', pattern: 'Woven', embellishments: ['Zari Work'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Sangeet'], search_tags: ['silk kurta', 'royal blue', 'wedding'], price_min: 495000, price_max: 495000, mrp: 695000, status: 'RESERVED', location_notes: 'Rack B · Row 2 · Stack 3', variants: [{ color: 'Green' }] },
    { name: 'Beige Dhoti Kurta Set', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Beige', secondary_colors: ['Brown'], fabric_estimate: 'Cotton-Silk Blend', pattern: 'Embroidered', embellishments: ['Thread Work'], neck_style: 'Round Neck', sleeve_type: 'Full Sleeve', occasions: ['Wedding', 'Festive'], search_tags: ['dhoti kurta', 'beige', 'traditional'], price_min: 395000, price_max: 395000, mrp: 550000, status: 'AVAILABLE', location_notes: 'Rack C · Row 2 · Stack 1', variants: [] },
    { name: 'Printed Cotton Kurta Navy', category: "Men's Kurta Pajama", product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['White'], fabric_estimate: 'Cotton', pattern: 'Printed', embellishments: ['None'], neck_style: 'Round Neck', sleeve_type: 'Half Sleeve', occasions: ['Casual', 'Office Wear'], search_tags: ['printed kurta', 'navy', 'cotton'], price_min: 129500, price_max: 129500, mrp: 199500, status: 'AVAILABLE', location_notes: 'Rack B · Row 4 · Stack 1', variants: [{ color: 'White' }, { color: 'Green' }] },
  ])

  const r2Customers = await createCustomers(r2.id, [
    { name: 'Amit Kumar', phone: '9821001111', pref_colors: ['Blue', 'Navy', 'Black'], pref_styles: ['Kurta Pajama', 'Pathani'], pref_fabrics: ['Cotton', 'Linen'], pref_occasions: ['Casual', 'Festive'], budget_min: 100000, budget_max: 300000, total_purchases: 4, total_spent: 695000 },
    { name: 'Rohit Sharma', phone: '9821002222', pref_colors: ['Maroon', 'Gold', 'Beige'], pref_styles: ['Sherwani', 'Indo-Western'], pref_fabrics: ['Silk', 'Linen'], pref_occasions: ['Wedding', 'Party Wear'], budget_min: 500000, budget_max: 2000000, total_purchases: 2, total_spent: 1900000 },
  ])

  await createInteractions(r2.id, r2Products, r2Customers)
  await createCollections(r2.id, r2, r2Products, r2Customers, [
    { title: "Groom's Wedding Collection", description: 'Everything a groom needs from sherwanis to indo-western jackets.', product_indices: [0, 1, 6], customer_index: 1 },
    { title: 'Casual Kurta Collection', description: 'Comfortable cotton kurtas for daily wear.', product_indices: [2, 4, 7] },
  ])

  // ── Retailer 3: Priya Fashions ─────────────────────────────────
  const r3 = await createRetailer({
    shop_name: 'Priya Fashions', owner_name: 'Priya Desai',
    phone: '9900012345', city: 'Surat', state: 'Gujarat',
    categories: ['Lehenga', 'Gown', 'Ladies Suit'],
    plan: 'PRO', plan_status: 'ACTIVE',
    sections: [
      { name: 'Rack A — Bridal Lehengas', type: 'rack' },
      { name: 'Rack B — Party Gowns', type: 'rack' },
      { name: 'Rack C — Designer Suits', type: 'rack' },
      { name: 'Shelf 1 — Accessories', type: 'shelf' },
    ],
  })

  const r3Products = await createProducts(r3.id, r3.sectionIds, [
    { name: 'Red Bridal Lehenga Zari Work', category: 'Lehenga', product_type: 'Readymade', primary_color: 'Red', secondary_colors: ['Gold'], fabric_estimate: 'Silk', pattern: 'Embroidered', embellishments: ['Zari Work', 'Zardozi', 'Stone Work', 'Resham Embroidery'], neck_style: 'Sweetheart', sleeve_type: 'Sleeveless', occasions: ['Wedding', 'Sangeet'], search_tags: ['bridal lehenga', 'red', 'heavy work', 'zari'], price_min: 2500000, price_max: 3500000, mrp: 4500000, status: 'AVAILABLE', location_notes: 'Rack A · Row 1 · Stack 1', variants: [{ color: 'Maroon' }] },
    { name: 'Pink Net Lehenga Party Wear', category: 'Lehenga', product_type: 'Readymade', primary_color: 'Pink', secondary_colors: ['Silver'], fabric_estimate: 'Net', pattern: 'Embroidered', embellishments: ['Sequin', 'Stone Work'], neck_style: 'Round Neck', sleeve_type: 'Cap Sleeve', occasions: ['Party Wear', 'Sangeet'], search_tags: ['lehenga', 'pink', 'net', 'party'], price_min: 850000, price_max: 850000, mrp: 1250000, status: 'AVAILABLE', location_notes: 'Rack A · Row 2 · Stack 2', variants: [{ color: 'Blue' }, { color: 'Teal' }] },
    { name: 'Gold Tissue Lehenga Festive', category: 'Lehenga', product_type: 'Readymade', primary_color: 'Gold', secondary_colors: ['Red'], fabric_estimate: 'Silk', pattern: 'Woven', embellishments: ['Zari Work'], neck_style: 'Boat Neck', sleeve_type: 'Sleeveless', occasions: ['Wedding', 'Festive'], search_tags: ['tissue lehenga', 'gold', 'festive'], price_min: 1500000, price_max: 1500000, mrp: 2200000, status: 'RESERVED', location_notes: 'Rack A · Row 1 · Stack 3', variants: [{ color: 'Orange' }] },
    { name: 'Teal Green Gown Floor Length', category: 'Gown', product_type: 'Readymade', primary_color: 'Teal', secondary_colors: ['Silver'], fabric_estimate: 'Chiffon', pattern: 'Embroidered', embellishments: ['Sequin', 'Stone Work'], neck_style: 'V-Neck', sleeve_type: 'Cap Sleeve', occasions: ['Party Wear', 'Sangeet'], search_tags: ['gown', 'teal', 'floor length', 'sequin'], price_min: 650000, price_max: 650000, mrp: 950000, status: 'AVAILABLE', location_notes: 'Rack B · Row 1 · Stack 1', variants: [{ color: 'Navy' }, { color: 'Black' }] },
    { name: 'Peach Gown Floral Embroidery', category: 'Gown', product_type: 'Readymade', primary_color: 'Peach', secondary_colors: ['Green'], fabric_estimate: 'Georgette', pattern: 'Embroidered', embellishments: ['Thread Work', 'Resham Embroidery'], neck_style: 'V-Neck', sleeve_type: 'Three-Quarter', occasions: ['Party Wear', 'Sangeet'], search_tags: ['peach gown', 'floral', 'georgette'], price_min: 495000, price_max: 495000, mrp: 750000, status: 'AVAILABLE', location_notes: 'Rack B · Row 2 · Stack 1', variants: [{ color: 'Mint' }] },
    { name: 'Black Mermaid Gown Cocktail', category: 'Gown', product_type: 'Readymade', primary_color: 'Black', secondary_colors: ['Silver'], fabric_estimate: 'Crepe', pattern: 'Embroidered', embellishments: ['Stone Work', 'Sequin'], neck_style: 'Sweetheart', sleeve_type: 'Sleeveless', occasions: ['Party Wear'], search_tags: ['mermaid gown', 'black', 'cocktail'], price_min: 750000, price_max: 750000, mrp: 1100000, status: 'SOLD', location_notes: 'Rack B · Row 1 · Stack 3', variants: [] },
    { name: 'Navy Blue Sharara Set', category: 'Ladies Suit', product_type: 'Readymade', primary_color: 'Navy', secondary_colors: ['Gold'], fabric_estimate: 'Georgette', pattern: 'Embroidered', embellishments: ['Gota Patti', 'Stone Work'], neck_style: 'Round Neck', sleeve_type: 'Three-Quarter', occasions: ['Wedding', 'Sangeet'], search_tags: ['sharara', 'navy', 'gota patti'], price_min: 550000, price_max: 550000, mrp: 800000, status: 'AVAILABLE', location_notes: 'Rack C · Row 1 · Stack 1', variants: [{ color: 'Green' }] },
    { name: 'Grey Lehenga Cocktail Party', category: 'Lehenga', product_type: 'Readymade', primary_color: 'Grey', secondary_colors: ['Silver'], fabric_estimate: 'Chiffon', pattern: 'Embroidered', embellishments: ['Sequin', 'Thread Work'], neck_style: 'V-Neck', sleeve_type: 'Cap Sleeve', occasions: ['Party Wear', 'Sangeet'], search_tags: ['lehenga', 'grey', 'cocktail', 'sequin'], price_min: 450000, price_max: 450000, mrp: 695000, status: 'AVAILABLE', location_notes: 'Rack A · Row 3 · Stack 2', variants: [{ color: 'Pink' }] },
  ])

  const r3Customers = await createCustomers(r3.id, [
    { name: 'Meera Patel', phone: '9900011111', pref_colors: ['Red', 'Gold', 'Pink'], pref_styles: ['Lehenga', 'Gown'], pref_fabrics: ['Silk', 'Net'], pref_occasions: ['Wedding', 'Sangeet'], budget_min: 1000000, budget_max: 5000000, total_purchases: 2, total_spent: 4000000 },
    { name: 'Sneha Kapoor', phone: '9900012222', pref_colors: ['Teal', 'Navy', 'Black'], pref_styles: ['Gown', 'Sharara'], pref_fabrics: ['Chiffon', 'Georgette'], pref_occasions: ['Party Wear', 'Sangeet'], budget_min: 300000, budget_max: 1500000, total_purchases: 3, total_spent: 1950000 },
    { name: 'Riddhi Shah', phone: '9900013333', pref_colors: ['Peach', 'Mint', 'Pink'], pref_styles: ['Lehenga', 'Gown'], pref_fabrics: ['Georgette', 'Chiffon'], pref_occasions: ['Wedding', 'Sangeet', 'Festive'], budget_min: 500000, budget_max: 2000000, total_purchases: 1, total_spent: 850000 },
  ])

  await createInteractions(r3.id, r3Products, r3Customers)
  await createCollections(r3.id, r3, r3Products, r3Customers, [
    { title: 'Bridal Collection Premium', description: 'Exclusive bridal lehengas for your special day.', product_indices: [0, 2, 6], customer_index: 0 },
    { title: 'Cocktail Party Picks', description: 'Stand out at every cocktail party.', product_indices: [1, 3, 4, 5, 7], customer_index: 1 },
  ])

  // ── Summary ──────────────────────────────────────────────────
  const counts = await prisma.retailer.count()
  const products = await prisma.product.count()
  const customers = await prisma.customer.count()
  const collections = await prisma.collection.count()

  console.log('\n── Seeding complete ──')
  console.log(`  🏪 Retailers:     ${counts}`)
  console.log(`  👕 Products:      ${products}`)
  console.log(`  👥 Customers:     ${customers}`)
  console.log(`  📦 Collections:   ${collections}`)
  console.log(`\n✅ Database seeded successfully!`)
}

// ── Create Retailer ────────────────────────────────────────────────

async function createRetailer(data: {
  shop_name: string; owner_name: string; phone: string;
  city: string; state: string; categories: string[];
  plan: 'STARTER' | 'GROWTH' | 'PRO'; plan_status: 'ACTIVE' | 'TRIAL';
  sections: { name: string; type: string }[];
}) {
  const retailer = await prisma.retailer.create({
    data: {
      auth_user_id: `seed-${data.phone}@kanchuki.app`,
      phone: data.phone,
      shop_name: data.shop_name,
      owner_name: data.owner_name,
      city: data.city,
      state: data.state,
      categories: data.categories,
      plan: data.plan,
      plan_status: data.plan_status,
      onboarding_completed: true,
      onboarding_step: 6,
      max_products: data.plan === 'PRO' ? 1_000_000 : data.plan === 'GROWTH' ? 2000 : 500,
      max_customers: data.plan === 'PRO' ? 1_000_000 : data.plan === 'GROWTH' ? 1000 : 200,
      try_on_credits: data.plan === 'PRO' ? 500 : data.plan === 'GROWTH' ? 100 : 0,
      plan_expires_at: new Date(Date.now() + 30 * 86_400_000),
    },
  })

  // Create subscription record
  const periodStart = new Date()
  const periodEnd = new Date(Date.now() + 30 * 86_400_000)
  await prisma.subscription.create({
    data: {
      retailer_id: retailer.id,
      plan: data.plan,
      status: 'ACTIVE',
      billing_period: 'monthly',
      amount_inr: data.plan === 'PRO' ? 499900 : data.plan === 'GROWTH' ? 249900 : 99900,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    },
  })

  // Create staff
  await prisma.staff.create({
    data: {
      retailer_id: retailer.id,
      name: data.owner_name,
      phone: data.phone,
      role: 'owner',
      is_active: true,
    },
  })

  // Create store sections
  const sections = await Promise.all(
    data.sections.map((s, i) =>
      prisma.storeSection.create({
        data: { retailer_id: retailer.id, name: s.name, type: s.type, sort_order: i + 1 },
      }),
    ),
  )

  console.log(`  ✅ ${data.shop_name} — ${data.plan} plan, ${data.sections.length} sections`)
  return { id: retailer.id, sectionIds: sections.map((s) => s.id) }
}

// ── Create Products ────────────────────────────────────────────────

async function createProducts(
  retailerId: string,
  sectionIds: string[],
  products: Array<{
    name: string; category: string; product_type: string;
    primary_color: string; secondary_colors: string[];
    fabric_estimate: string; pattern: string; embellishments: string[];
    neck_style: string; sleeve_type: string;
    occasions: string[]; search_tags: string[];
    price_min: number; price_max: number; mrp: number;
    status: string; location_notes: string;
    variants: { color: string }[];
  }>,
) {
  const createdIds: string[] = []

  for (const [pi, p] of products.entries()) {
    const sectionId = sectionIds[pi % sectionIds.length]!

    const product = await prisma.product.create({
      data: {
        retailer_id: retailerId,
        section_id: sectionId,
        name: p.name,
        price_min: p.price_min,
        price_max: p.price_max,
        mrp: p.mrp,
        status: p.status as any,
        category: p.category,
        product_type: p.product_type,
        primary_color: p.primary_color,
        secondary_colors: p.secondary_colors,
        fabric_estimate: p.fabric_estimate,
        pattern: p.pattern,
        embellishments: p.embellishments,
        neck_style: p.neck_style,
        sleeve_type: p.sleeve_type,
        occasions: p.occasions,
        search_tags: p.search_tags,
        ai_tagged: true,
        location_notes: p.location_notes,
      },
    })

    // Photo
    await prisma.productPhoto.create({
      data: {
        product_id: product.id,
        retailer_id: retailerId,
        url: placeholderUrl(p.category, p.primary_color, pi),
        r2_key: `seed/products/${product.id}/primary.jpg`,
        is_primary: true,
        sort_order: 0,
        ai_tagged: true,
      },
    })

    // Variants
    for (const v of p.variants) {
      await prisma.productVariant.create({
        data: {
          product_id: product.id,
          retailer_id: retailerId,
          color: v.color,
          photo_url: placeholderUrl(p.category, v.color, pi),
          status: 'AVAILABLE',
        },
      })
    }

    createdIds.push(product.id)
  }

  console.log(`  👕 Created ${createdIds.length} products`)
  return createdIds
}

// ── Create Customers ───────────────────────────────────────────────

async function createCustomers(
  retailerId: string,
  customers: Array<{
    name: string; phone: string;
    pref_colors: string[]; pref_styles: string[]; pref_fabrics: string[]; pref_occasions: string[];
    budget_min: number; budget_max: number;
    total_purchases: number; total_spent: number;
  }>,
) {
  const createdIds: string[] = []

  for (const c of customers) {
    const customer = await prisma.customer.create({
      data: {
        retailer_id: retailerId,
        name: c.name,
        phone: c.phone,
        pref_colors: c.pref_colors,
        pref_styles: c.pref_styles,
        pref_fabrics: c.pref_fabrics,
        pref_occasions: c.pref_occasions,
        budget_min: c.budget_min,
        budget_max: c.budget_max,
        total_purchases: c.total_purchases,
        total_spent: c.total_spent,
        last_visit_at: new Date(Date.now() - randomInt(1, 60) * 86_400_000),
      },
    })
    createdIds.push(customer.id)
  }

  console.log(`  👥 Created ${createdIds.length} customers`)
  return createdIds
}

// ── Create Customer Interactions ───────────────────────────────────

async function createInteractions(
  retailerId: string,
  productIds: string[],
  customerIds: string[],
) {
  let count = 0
  for (const customerId of customerIds) {
    for (let pi = 0; pi < Math.min(productIds.length, 4); pi++) {
      await prisma.customerInteraction.create({
        data: {
          customer_id: customerId,
          retailer_id: retailerId,
          product_id: productIds[pi]!,
          type: randomPick(['view', 'view', 'view', 'favorite', 'enquiry'] as const),
          created_at: new Date(Date.now() - randomInt(1, 60) * 86_400_000),
        },
      })
      count++
    }
  }
  console.log(`  📊 Created ${count} interactions`)
}

// ── Create Collections ─────────────────────────────────────────────

async function createCollections(
  retailerId: string,
  retailer: { shop_name: string },
  productIds: string[],
  customerIds: string[],
  collections: Array<{
    title: string; description: string;
    product_indices: number[]; customer_index?: number;
  }>,
) {
  let collectionSlugCounter = 0

  for (const [ci, c] of collections.entries()) {
    const customerId = c.customer_index !== undefined
      ? customerIds[c.customer_index]
      : null

    const slug = `${slugify(retailer.shop_name)}-${slugify(c.title)}-${Date.now()}-${collectionSlugCounter++}`
    const expiresAt = new Date(Date.now() + 90 * 86_400_000)

    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        customer_id: customerId,
        title: c.title,
        description: c.description,
        slug,
        status: 'ACTIVE',
        expires_at: expiresAt,
        view_count: randomInt(10, 200),
        unique_viewer_count: randomInt(5, 80),
        enquiry_count: randomInt(0, 15),
        favorite_count: randomInt(1, 30),
      },
    })

    // Link products using stored IDs
    for (let sortOrder = 0; sortOrder < c.product_indices.length; sortOrder++) {
      const prodIndex = c.product_indices[sortOrder]!
      if (prodIndex < productIds.length) {
        await prisma.collectionProduct.create({
          data: {
            collection_id: collection.id,
            product_id: productIds[prodIndex]!,
            sort_order: sortOrder,
          },
        })
      }
    }

    // Views
    await prisma.collectionView.createMany({
      data: Array.from({ length: randomInt(5, 30) }, (_, vi) => ({
        collection_id: collection.id,
        retailer_id: retailerId,
        viewer_token: `seed-${retailerId.slice(-8)}-${ci}-${vi}`,
        created_at: new Date(Date.now() - randomInt(1, 60) * 86_400_000),
      })),
    })

    // Enquiry
    if (customerId && c.product_indices.length > 0) {
      const firstProductIndex = c.product_indices[0]!
      const firstProductId = productIds[firstProductIndex]
      if (firstProductId) {
        await prisma.collectionEnquiry.create({
          data: {
            collection_id: collection.id,
            retailer_id: retailerId,
            product_id: firstProductId,
            customer_name: 'Customer',
            customer_phone: '9876543210',
            message: 'Please share availability and pricing. Thank you!',
            status: randomPick(['NEW', 'SEEN', 'REPLIED']),
            created_at: new Date(Date.now() - randomInt(1, 14) * 86_400_000),
          },
        })
      }
    }
  }

  console.log(`  📦 Created ${collections.length} collections`)
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
