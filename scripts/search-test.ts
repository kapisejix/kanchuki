/**
 * AI Search Test: Hindi + English Mixed Queries
 *
 * Tests the POST /v1/search endpoint with:
 * - Pure English queries
 * - Transliterated Hindi queries (e.g. "lal suit")
 * - Devanagari Hindi queries (e.g. "लाल सूट")
 * - Mixed Hindi-English + budget (e.g. "लाल सूट under 3000")
 * - Budget extraction queries
 *
 * Usage: npx tsx scripts/search-test.ts
 */

const API = 'http://localhost:3001'

async function getToken(): Promise<string> {
  // Send OTP
  await fetch(`${API}/v1/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999' }),
  })

  // Verify OTP
  const res = await fetch(`${API}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919999999999', otp: '123456' }),
  })
  const json = await res.json() as { data: { access_token: string } }
  return json.data.access_token
}

async function search(token: string, query: string, label: string) {
  console.log(`\n── Test: ${label} ────────────────────────────────`)
  console.log(`  Query: "${query}"`)

  try {
    const res = await fetch(`${API}/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, limit: 5 }),
      signal: AbortSignal.timeout(30_000),
    })

    const body = await res.json() as {
      data?: Array<Record<string, unknown>>
      query_interpretation?: Record<string, unknown>
      error?: { code: string; message: string }
    }

    if (!res.ok) {
      console.log(`  ❌ Error: ${body.error?.code ?? res.status} — ${body.error?.message ?? 'Unknown'}`)
      return
    }

    const results = body.data ?? []
    const interpretation = body.query_interpretation ?? {}

    console.log(`  Results: ${results.length}`)
    console.log(`  Interpretation: ${JSON.stringify(interpretation)}`)

    for (const [i, p] of results.entries()) {
      const r = p as Record<string, unknown>
      console.log(`  [${i + 1}] ${(r.category as string) ?? '?'} | ${(r.primary_color as string) ?? '?'} | ₹${((r.price_min as number) ?? 0) / 100} | ${(r.status as string) ?? '?'}`)
    }
  } catch (err) {
    console.log(`  ❌ Exception: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main() {
  console.log(`╔════════════════════════════════════════════════╗`)
  console.log(`║   🔍 AI Search Hindi-English Test Suite      ║`)
  console.log(`╚════════════════════════════════════════════════╝`)
  console.log(`  API: ${API}`)
  console.log()

  const token = await getToken()
  console.log(`  ✅ Token acquired (${token.slice(0, 20)}...)`)
  console.log()

  // ── English queries ─────────────────────────────────────────
  await search(token, 'red suit', 'English: "red suit"')
  await search(token, 'blue kurta', 'English: "blue kurta"')
  await search(token, 'cotton saree under 2000', 'English: "cotton saree under 2000"')
  await search(token, 'wedding wear', 'English: "wedding wear"')
  await search(token, 'pink gown party wear', 'English: "pink gown party wear"')

  // ── Transliterated Hindi (Latin script) ─────────────────────
  await search(token, 'lal suit', 'Transliterated Hindi: "lal suit"')
  await search(token, 'neeli kurta', 'Transliterated Hindi: "neeli kurta"')
  await search(token, 'sadi cotton', 'Transliterated Hindi: "sadi cotton"')
  await search(token, 'peela lehenga', 'Transliterated Hindi: "peela lehenga"')
  await search(token, 'shadi wear', 'Transliterated Hindi: "shadi wear"')
  await search(token, 'hara cotton kurta', 'Transliterated Hindi: "hara cotton kurta"')

  // ── Devanagari Hindi (Hindi script) ─────────────────────────
  await search(token, 'लाल सूट', 'Devnagari: "लाल सूट"')
  await search(token, 'नीली कुर्ती', 'Devnagari: "नीली कुर्ती"')
  await search(token, 'सूती साड़ी', 'Devnagari: "सूती साड़ी"')

  // ── Mixed Hindi + English + Budget ──────────────────────────
  await search(token, 'lal suit under 3000', 'Mixed: "lal suit under 3000"')
  await search(token, 'लाल सूट under 3000', 'Mixed: "लाल सूट under 3000" (Devnagari + budget)')
  await search(token, 'cotton suit 1000 to 3000', 'Budget range: "cotton suit 1000 to 3000"')

  // ── Edge cases ──────────────────────────────────────────────
  await search(token, 'suit', 'Single word: "suit"')
  await search(token, '', 'Empty query (should validate error)')
  await search(token, 'xyzabc', 'No-match: "xyzabc" (garbage)')

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  ✅ ALL SEARCH TESTS COMPLETED')
  console.log('═══════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('\n💥 Fatal:', err)
  process.exit(1)
})
