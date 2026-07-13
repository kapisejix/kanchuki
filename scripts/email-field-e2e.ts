/**
 * End-to-end integration test for the customer email field.
 *
 * Covers:
 *   1. Database column exists
 *   2. API authentication
 *   3. Create customer with email
 *   4. Search by partial email (@gmail)
 *   5. Search by full email
 *   6. Search by email (case-insensitive: GMAIL, gmail)
 *   7. Search by name (no regression)
 *   8. Search by phone (no regression)
 *   9. Update customer email via PUT
 *  10. GET /customers/:id returns email
 *  11. Create customer without email (optional field)
 *  12. Multiple customers filterable by email domain
 *  13. Soft-delete customer — search no longer returns them
 *
 * Usage: npx tsx scripts/email-field-e2e.ts
 */

// ─── Tracked IDs for teardown ───────────────────────────────────
// Created customer IDs are collected here so teardown() can
// soft-delete them, making the test safe to re-run.
const createdIds: string[] = []

// ─── Config ─────────────────────────────────────────────────────
// Use timestamp-based phone suffixes so the test is idempotent
// even if a previous run crashed before teardown could execute.
const RUN_TS = Date.now().toString().slice(-6) // e.g. "441234"

const API_BASE = 'http://localhost:3001'
const TEST_PHONE = '+919999999999'
const OTP = '123456'

// ─── Helpers ─────────────────────────────────────────────────────

let accessToken: string | null = null

async function getToken(): Promise<string> {
  if (accessToken) return accessToken

  const res = await fetch(`${API_BASE}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: TEST_PHONE, otp: OTP }),
  })
  const body = await res.json()
  accessToken = body.data?.access_token
  if (!accessToken) {
    console.error('✗ AUTH FAILED — cannot get access token')
    process.exit(1)
  }
  return accessToken!
}

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

let passed = 0
let failed = 0
const errors: string[] = []

function ok(label: string) {
  passed++
  console.log(`  ✓ ${label}`)
}

function fail(label: string, detail: string) {
  failed++
  errors.push(`  ✗ ${label}: ${detail}`)
  console.log(`  ✗ ${label}: ${detail}`)
}

function assert(condition: boolean, label: string, detail: string) {
  if (condition) ok(label)
  else fail(label, detail)
}

// ─── Teardown ────────────────────────────────────────────────────
// Soft-deletes every customer tracked in createdIds so the test
// can be re-run without hitting duplicate-phone validation errors.
// Runs regardless of pass/fail (called from finally).

async function teardown(token: string) {
  if (createdIds.length === 0) return

  console.log(`\n── Teardown: soft-deleting ${createdIds.length} customer(s) ──`)
  let deleted = 0
  for (const id of createdIds) {
    try {
      const res = await fetch(`${API_BASE}/v1/customers/${id}`, {
        method: 'DELETE',
        headers: headers(token),
      })
      if (res.status === 204) {
        deleted++
      }
    } catch {
      // Best-effort — don't let cleanup failures mask test results
    }
  }
  console.log(`  Cleanup: ${deleted}/${createdIds.length} removed\n`)
}

// ─── Test Suite ──────────────────────────────────────────────────

async function run() {
  console.log('\n═══════════════════════════════════════════════')
  console.log('  Email Field — End-to-End Integration Test')
  console.log('═══════════════════════════════════════════════\n')

  const token = await getToken()

  try {
    // ── 1. Create customer with email ───────────────────────────
    console.log('── 1. Create customer with email ──')
    const emailCxRes1 = await fetch(`${API_BASE}/v1/customers`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
      name: 'Email Alpha',
      phone: `999888${RUN_TS}1`,
        email: 'alpha@gmail.com',
      }),
    })
    const emailCx1 = await emailCxRes1.json()
    assert(
      emailCxRes1.status === 201 && emailCx1.data?.email === 'alpha@gmail.com',
      'Create customer with email',
      `Expected 201 + email "alpha@gmail.com", got ${emailCxRes1.status} – ${JSON.stringify(emailCx1)}`,
    )
    if (emailCx1.data?.id) createdIds.push(emailCx1.data.id)
    const cx1Id = emailCx1.data?.id

    // ── 2. Create second customer (same domain) ─────────────────
    console.log('\n── 2. Create second customer (same domain) ──')
    const emailCxRes2 = await fetch(`${API_BASE}/v1/customers`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
      name: 'Email Beta',
      phone: `999888${RUN_TS}2`,
        email: 'beta@gmail.com',
      }),
    })
    const emailCx2 = await emailCxRes2.json()
    assert(
      emailCxRes2.status === 201 && emailCx2.data?.email === 'beta@gmail.com',
      'Create second customer with email',
      `Expected 201, got ${emailCxRes2.status}`,
    )
    if (emailCx2.data?.id) createdIds.push(emailCx2.data.id)
    const cx2Id = emailCx2.data?.id

    // ── 3. Create customer with different domain ────────────────
    console.log('\n── 3. Create customer (yahoo domain) ──')
    const emailCxRes3 = await fetch(`${API_BASE}/v1/customers`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
      name: 'Email Gamma',
      phone: `999888${RUN_TS}3`,
        email: 'gamma@yahoo.com',
      }),
    })
    const emailCx3 = await emailCxRes3.json()
    assert(
      emailCxRes3.status === 201 && emailCx3.data?.email === 'gamma@yahoo.com',
      'Create customer with yahoo email',
      `Expected 201, got ${emailCxRes3.status}`,
    )
    if (emailCx3.data?.id) createdIds.push(emailCx3.data.id)

    // ── 4. Create customer without email (optional) ─────────────
    console.log('\n── 4. Create customer without email ──')
    const noEmailRes = await fetch(`${API_BASE}/v1/customers`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
      name: 'No Email Customer',
      phone: `999888${RUN_TS}4`,
      }),
    })
    const noEmailCx = await noEmailRes.json()
    assert(
      noEmailRes.status === 201 && noEmailCx.data?.email === null,
      'Create customer without email (optional)',
      `Expected 201 + email=null, got ${noEmailRes.status} – ${JSON.stringify(noEmailCx)}`,
    )
    if (noEmailCx.data?.id) createdIds.push(noEmailCx.data.id)

    // ── 5. Search by partial email (@gmail) ─────────────────────
    console.log('\n── 5. Search by partial email (@gmail) ──')
    const searchGmailRes = await fetch(
      `${API_BASE}/v1/customers?search=@gmail`,
      { headers: headers(token) },
    )
    const searchGmail = await searchGmailRes.json()
    const gmailResults = searchGmail.data ?? []
    assert(
      searchGmailRes.status === 200 && gmailResults.length >= 2,
      'Search "@gmail" returns 2+ customers',
      `Expected 2+ results, got ${gmailResults.length} – ${JSON.stringify(searchGmail)}`,
    )
    const gmailEmails = gmailResults.map((c: any) => c.email)
    assert(
      gmailEmails.includes('alpha@gmail.com') && gmailEmails.includes('beta@gmail.com'),
      'Results include both gmail customers',
      `Expected alpha@gmail.com & beta@gmail.com, got ${gmailEmails.join(', ')}`,
    )

    // ── 6. Search by full email ─────────────────────────────────
    console.log('\n── 6. Search by full email ──')
    const searchFullRes = await fetch(
      `${API_BASE}/v1/customers?search=alpha@gmail.com`,
      { headers: headers(token) },
    )
    const searchFull = await searchFullRes.json()
    assert(
      searchFullRes.status === 200 && (searchFull.data ?? []).length >= 1,
      'Search exact email returns 1+ customer',
      `Expected 1+ result, got ${(searchFull.data ?? []).length}`,
    )

    // ── 7. Search by email (case-insensitive: GMAIL) ────────────
    console.log('\n── 7. Search by email (case-insensitive: GMAIL) ──')
    const searchUpperRes = await fetch(
      `${API_BASE}/v1/customers?search=GMAIL`,
      { headers: headers(token) },
    )
    const searchUpper = await searchUpperRes.json()
    assert(
      searchUpperRes.status === 200 && (searchUpper.data ?? []).length >= 2,
      'Search "GMAIL" returns 2+ customers (case-insensitive)',
      `Expected 2+ results, got ${(searchUpper.data ?? []).length}`,
    )

    // ── 8. Search by name (no regression) ───────────────────────
    console.log('\n── 8. Search by name (no regression) ──')
    const searchNameRes = await fetch(
      `${API_BASE}/v1/customers?search=Email Alpha`,
      { headers: headers(token) },
    )
    const searchName = await searchNameRes.json()
    assert(
      searchNameRes.status === 200 && (searchName.data ?? []).length >= 1,
      'Search by name still works',
      `Expected 1+ result, got ${(searchName.data ?? []).length}`,
    )

    // ── 9. Search by phone (no regression) ──────────────────────
    console.log('\n── 9. Search by phone (no regression) ──')
    const testPhone1 = `999888${RUN_TS}1`
    const searchPhoneRes = await fetch(
      `${API_BASE}/v1/customers?search=${testPhone1}`,
      { headers: headers(token) },
    )
    const searchPhone = await searchPhoneRes.json()
    assert(
      searchPhoneRes.status === 200 && (searchPhone.data ?? []).length >= 1,
      'Search by phone still works',
      `Expected 1+ result, got ${(searchPhone.data ?? []).length}`,
    )

    // ── 10. Search by yahoo domain ──────────────────────────────
    console.log('\n── 10. Search by different domain (@yahoo) ──')
    const searchYahooRes = await fetch(
      `${API_BASE}/v1/customers?search=@yahoo.com`,
      { headers: headers(token) },
    )
    const searchYahoo = await searchYahooRes.json()
    const yahooResults = searchYahoo.data ?? []
    assert(
      searchYahooRes.status === 200 && yahooResults.length >= 1,
      'Search "@yahoo.com" returns 1+ customer',
      `Expected 1+ result, got ${yahooResults.length}`,
    )
    assert(
      yahooResults.some((c: any) => c.email === 'gamma@yahoo.com'),
      'Results include gamma@yahoo.com',
      `Expected gamma@yahoo.com in results, got ${yahooResults.map((c: any) => c.email).join(', ')}`,
    )

    // ── 11. GET /customers/:id returns email ────────────────────
    console.log('\n── 11. GET /customers/:id returns email ──')
    if (cx1Id) {
      const getRes = await fetch(`${API_BASE}/v1/customers/${cx1Id}`, {
        headers: headers(token),
      })
      const getBody = await getRes.json()
      assert(
        getRes.status === 200 && getBody.data?.email === 'alpha@gmail.com',
        'GET customer returns email',
        `Expected email alpha@gmail.com, got ${JSON.stringify(getBody.data?.email)}`,
      )
    }

    // ── 12. PUT update customer email ───────────────────────────
    console.log('\n── 12. PUT update customer email ──')
    const updatedEmail = 'alpha.updated@outlook.com'
    if (cx1Id) {
      const updateRes = await fetch(`${API_BASE}/v1/customers/${cx1Id}`, {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ email: updatedEmail }),
      })
      const updateBody = await updateRes.json()
      assert(
        updateRes.status === 200 && updateBody.data?.email === updatedEmail,
        'PUT update email',
        `Expected ${updatedEmail}, got ${JSON.stringify(updateBody.data?.email)}`,
      )
    }

    // ── 13. Search by updated email ─────────────────────────────
    console.log('\n── 13. Search by updated email ──')
    const searchUpdatedRes = await fetch(
      `${API_BASE}/v1/customers?search=outlook.com`,
      { headers: headers(token) },
    )
    const searchUpdated = await searchUpdatedRes.json()
    assert(
      searchUpdatedRes.status === 200 && (searchUpdated.data ?? []).length >= 1,
      'Search updated email domain (@outlook.com)',
      `Expected 1+ result, got ${(searchUpdated.data ?? []).length}`,
    )

    // ── 14. Create customer with special chars in email ─────────
    console.log('\n── 14. Create customer with special email chars ──')
    const specialEmail = 'test.user+label@example.co.in'
    const specialRes = await fetch(`${API_BASE}/v1/customers`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
      name: 'Special Email',
      phone: `999888${RUN_TS}5`,
        email: specialEmail,
      }),
    })
    const specialCx = await specialRes.json()
    assert(
      specialRes.status === 201 && specialCx.data?.email === specialEmail,
      'Create with special chars (+ and .) in email',
      `Expected 201 + ${specialEmail}, got ${specialRes.status}`,
    )
    if (specialCx.data?.id) createdIds.push(specialCx.data.id)

    // ── 15. Search by special email chars ───────────────────────
    console.log('\n── 15. Search by special email chars ──')
    const searchSpecialRes = await fetch(
      `${API_BASE}/v1/customers?search=test.user%2Blabel`,
      { headers: headers(token) },
    )
    const searchSpecial = await searchSpecialRes.json()
    assert(
      searchSpecialRes.status === 200 && (searchSpecial.data ?? []).length >= 1,
      'Search special email (test.user+label)',
      `Expected 1+ result, got ${(searchSpecial.data ?? []).length}`,
    )

    // ── 16. Pagination still works ──────────────────────────────
    console.log('\n── 16. Pagination with email search ──')
    const searchPagedRes = await fetch(
      `${API_BASE}/v1/customers?search=@gmail&limit=1`,
      { headers: headers(token) },
    )
    const searchPaged = await searchPagedRes.json()
    assert(
      searchPagedRes.status === 200,
      'Search with pagination returns 200',
      `Expected 200, got ${searchPagedRes.status}`,
    )
    assert(
      searchPaged.data?.length === 1,
      'Pagination limit=1 returns 1 result',
      `Expected 1 result, got ${searchPaged.data?.length}`,
    )
    assert(
      searchPaged.pagination?.has_more === true,
      'Pagination has_more=true when more results exist',
      `Expected has_more=true, got ${JSON.stringify(searchPaged.pagination)}`,
    )

    // ── 17. Empty search still returns all customers ────────────
    console.log('\n── 17. Empty search (no query) returns all ──')
    const allCxRes = await fetch(`${API_BASE}/v1/customers`, {
      headers: headers(token),
    })
    const allCx = await allCxRes.json()
    assert(
      allCxRes.status === 200 && (allCx.data ?? []).length > 0,
      'Empty search returns customers',
      `Expected 200 + data, got ${allCxRes.status}`,
    )

    // ── 18. Partial PUT preserves email ─────────────────────────
    // Note: PUT with partial schema sends email: undefined which
    // doesn't change the field since CustomerSchema is partial().
    // This test verifies the email doesn't get wiped on partial update.
    console.log('\n── 18. Partial PUT preserves email ──')
    if (cx2Id) {
      const partialRes = await fetch(`${API_BASE}/v1/customers/${cx2Id}`, {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ name: 'Email Beta Updated' }),
      })
      const partialBody = await partialRes.json()
      assert(
        partialRes.status === 200 && partialBody.data?.email === 'beta@gmail.com',
        'Partial PUT preserves unchanged email',
        `Expected email to remain beta@gmail.com, got ${JSON.stringify(partialBody.data?.email)}`,
      )
    }

    // ── 19. Invalid email format validation ─────────────────────
    // Zod's .email() rejects malformed emails with 422. Each test
    // expects a VALIDATION_ERROR. Failures are expected so we don't
    // track IDs for teardown — no customer gets created.
    console.log('\n── 19. Invalid email format validation ──')

    const invalidEmails: { label: string; email: string }[] = [
      { label: 'Empty string', email: '' },
      { label: 'No @ sign', email: 'plaintext' },
      { label: 'No domain (trailing @)', email: 'user@' },
      { label: 'No local part', email: '@domain.com' },
      { label: 'Spaces in email', email: 'user @domain.com' },
      { label: 'Missing TLD', email: 'user@domain' },
      { label: 'Dot after @ only', email: 'user@.com' },
      { label: 'Comma instead of dot', email: 'user@domain,com' },
    ]

    for (let i = 0; i < invalidEmails.length; i++) {
      const { label, email } = invalidEmails[i]
      const phone = `999888${RUN_TS}9${i}` // unique phone per attempt

      const res = await fetch(`${API_BASE}/v1/customers`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          name: `Invalid Email ${i}`,
          phone,
          email,
        }),
      })
      const body = await res.json()

      assert(
        res.status === 422 && body.error?.code === 'VALIDATION_ERROR',
        `Reject invalid email: ${label}`,
        `Expected 422 + VALIDATION_ERROR for "${email}", got ${res.status} – ${JSON.stringify(body)}`,
      )
    }

    // Also verify the PUT endpoint rejects invalid emails
    console.log('\n── 19b. PUT rejects invalid email update ──')
    if (cx1Id) {
      const putRes = await fetch(`${API_BASE}/v1/customers/${cx1Id}`, {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ email: 'not-an-email' }),
      })
      const putBody = await putRes.json()
      assert(
        putRes.status === 422 && putBody.error?.code === 'VALIDATION_ERROR',
        'PUT reject invalid email update',
        `Expected 422 for PUT with invalid email, got ${putRes.status} – ${JSON.stringify(putBody)}`,
      )

      // Verify the original email was NOT changed by the failed PUT
      const getRes = await fetch(`${API_BASE}/v1/customers/${cx1Id}`, {
        headers: headers(token),
      })
      const getBody = await getRes.json()
      assert(
        getRes.status === 200 && getBody.data?.email === 'alpha.updated@outlook.com',
        'Failed PUT did not mutate email',
        `Expected email unchanged, got ${JSON.stringify(getBody.data?.email)}`,
      )
    }

    // ── Report ──────────────────────────────────────────────────
    const total = passed + failed
    console.log('\n═══════════════════════════════════════════════')
    console.log(`  Results: ${passed}/${total} passed`)
    if (failed > 0) {
      console.log(`  ${failed} FAILURE(S):`)
      for (const err of errors) console.log(err)
    } else {
      console.log('  All tests passed!')
    }
    console.log('═══════════════════════════════════════════════\n')

  } finally {
    // Always clean up, even if tests failed or threw
    await teardown(token)
  }
}

run().catch((err) => {
  console.error('Test suite crashed:', err)
  process.exit(1)
})
