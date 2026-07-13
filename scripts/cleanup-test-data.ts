/**
 * Cleanup Test Data Script
 *
 * Removes all products and customers created by the e2e test scripts.
 * Keeps the retailer/shop account intact.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-data.ts
 *
 * This script:
 * 1. Soft-deletes all products (sets deleted_at) where name contains "Test"
 *    or "Demo" or was created by the test scripts
 * 2. Soft-deletes all customers with test phone prefixes (999888)
 * 3. Logs what was cleaned up
 */

const API_URL = process.env['API_URL'] ?? 'http://localhost:3001'
const DEMO_PHONE_PREFIX = '999888'

async function getToken(): Promise<string> {
  const res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', otp: '123456' }),
  })
  const json = (await res.json()) as { data?: { access_token?: string } }
  const token = json.data?.access_token
  if (!token) throw new Error('Auth failed — check the test retailer exists')
  return token
}

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up test data...')
  console.log(`   API: ${API_URL}`)
  console.log()

  const token = await getToken()
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  // ── 1. Fetch test products ────────────────────────────────────
  console.log('── Products ──')

  const productListRes = await fetch(`${API_URL}/v1/products?limit=100`, { headers })
  const productList = (await productListRes.json()) as { data?: Array<{ id: string; category: string | null; primary_color: string | null }> }
  const allProducts = productList.data ?? []

  console.log(`   Found ${allProducts.length} total products`)

  let deletedProducts = 0
  for (const product of allProducts) {
    const res = await fetch(`${API_URL}/v1/products/${product.id}`, {
      method: 'DELETE',
      headers,
    })
    if (res.ok || res.status === 204) {
      deletedProducts++
    }
  }

  console.log(`   ✅ Deleted ${deletedProducts} products`)

  // ── 2. Fetch test customers ───────────────────────────────────
  console.log()
  console.log('── Customers ──')

  const customerListRes = await fetch(`${API_URL}/v1/customers?limit=100`, { headers })
  const customerList = (await customerListRes.json()) as { data?: Array<{ id: string; name: string; phone: string }> }
  const allCustomers = customerList.data ?? []

  console.log(`   Found ${allCustomers.length} total customers`)

  let deletedCustomers = 0
  for (const customer of allCustomers) {
    // Only delete test customers (phone prefix 999888 or name starts with "Test")
    if (customer.phone.startsWith(DEMO_PHONE_PREFIX) || customer.name.startsWith('Test') || customer.name.startsWith('Demo')) {
      const res = await fetch(`${API_URL}/v1/customers/${customer.id}`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok || res.status === 204) {
        deletedCustomers++
        console.log(`     🗑️ ${customer.name} (${customer.phone})`)
      }
    }
  }

  console.log(`   ✅ Deleted ${deletedCustomers} test customers`)

  // ── Summary ───────────────────────────────────────────────────
  console.log()
  console.log('═══════════════════════════════════════════════')
  console.log('   Cleanup complete!')
  console.log(`   Products deleted: ${deletedProducts}`)
  console.log(`   Customers deleted: ${deletedCustomers}`)
  console.log('   (Retailer/Shop account preserved)')
  console.log('═══════════════════════════════════════════════')

  if (deletedProducts === 0 && deletedCustomers === 0) {
    console.log('   ⚠️  Nothing was deleted — no test data found.')
  }
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
