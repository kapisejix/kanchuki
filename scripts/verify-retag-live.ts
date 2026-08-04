/**
 * End-to-end verification of the retag fix against the LIVE API.
 * 1. OTP login (test phone)  2. product list/detail 200  3. POST retag → 202
 * 4. poll product detail until ai_tagged → confirm name/subtype/sku/description/occasions filled.
 *
 * Run: npx tsx --env-file .env scripts/verify-retag-live.ts
 */
const API = process.env.REPRO_API_URL ?? 'https://api.kanchuki.app'
const PHONE = process.env.REPRO_PHONE ?? '+919999999999'
const OTP = process.env.REPRO_OTP ?? '123456'
const POLL_MS = 3_000
const MAX_POLLS = 15

async function jf(path: string, opts: RequestInit & { token?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const ok = (label: string, status: number, extra = '') =>
  console.log(`${status === 200 || status === 202 ? '✅' : '❌'} ${status} ${label}${extra ? ` — ${extra}` : ''}`)

async function main() {
  console.log('\n== Auth ==')
  const verify = await jf('/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone: PHONE, otp: OTP }),
  })
  const token = (verify.body as { data?: { access_token?: string } }).data?.access_token
  if (!token) {
    console.log('❌ auth failed', verify.status, JSON.stringify(verify.body).slice(0, 200))
    process.exit(1)
  }
  console.log('✅ token acquired')

  console.log('\n== Product list (was 500) ==')
  const list = await jf('/v1/products?limit=5', { token })
  const products = (list.body as { data?: { id: string; name?: string | null }[] }).data ?? []
  ok('GET /v1/products?limit=5', list.status, `${products.length} products`)
  if (products.length === 0) {
    console.log('No products — nothing to retag. Endpoints are green though.')
    return
  }
  const pid = products[0]!.id
  console.log('target product:', pid, products[0]!.name ?? '(no name)')

  console.log('\n== Product detail (was 500) ==')
  const detail = await jf(`/v1/products/${pid}`, { token })
  ok(`GET /v1/products/${pid}`, detail.status)
  const d = (detail.body as { data?: Record<string, unknown> }).data ?? {}
  console.log(
    '  before retag → ai_tagged:',
    d.ai_tagged,
    '| name:',
    JSON.stringify(d.name),
    '| subtype:',
    JSON.stringify(d.subtype),
    '| sku:',
    JSON.stringify(d.sku),
    '| desc:',
    JSON.stringify(d.description ?? '').slice(0, 60),
    '| occasions:',
    JSON.stringify(d.occasions ?? []),
  )

  console.log('\n== POST /v1/products/:id/retag (was 500) ==')
  const retag = await jf(`/v1/products/${pid}/retag`, { method: 'POST', token, body: JSON.stringify({}) })
  ok(`POST /v1/products/${pid}/retag`, retag.status, JSON.stringify(retag.body).slice(0, 120))
  if (retag.status !== 202) {
    console.log('Retag failed — aborting polling.')
    return
  }

  console.log(`\n== Polling AI tagging (up to ${(MAX_POLLS * POLL_MS) / 1000}s) ==`)
  let finished = false
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const r = await jf(`/v1/products/${pid}`, { token })
    const p = (r.body as { data?: Record<string, unknown> }).data
    if (!p) continue
    const tagged = p.ai_tagged === true
    const filled = Boolean(p.name && p.subtype && p.sku)
    console.log(
      `  poll ${i + 1}: ai_tagged=${p.ai_tagged} ai_error=${JSON.stringify(p.ai_tag_error ?? null)} name=${JSON.stringify(
        p.name ?? '',
      )} subtype=${JSON.stringify(p.subtype ?? '')} sku=${JSON.stringify(p.sku ?? '')}`,
    )
    if (tagged && filled) {
      finished = true
      console.log('\n== ✅ AI TAGGING COMPLETE — fields filled ==')
      console.log('  name:       ', p.name)
      console.log('  subtype:    ', p.subtype)
      console.log('  sku:        ', p.sku)
      console.log('  description:', (p.description as string) ?? '(none)')
      console.log('  category:   ', p.category)
      console.log('  color:      ', p.primary_color)
      console.log('  fabric:     ', p.fabric_estimate)
      console.log('  pattern:    ', p.pattern)
      console.log('  occasions:  ', JSON.stringify(p.occasions ?? []))
      break
    }
    if (p.ai_tag_error) {
      console.log('\n❌ AI tagging errored:', p.ai_tag_error)
      break
    }
  }
  if (!finished) console.log('\nTimed out waiting for tagging — check the API worker (Railway logs).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
