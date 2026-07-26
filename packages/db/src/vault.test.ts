// F-016 Deletion Vault — INSERT-only permission verification
//
// This test verifies that the vault database connection (VAULT_DATABASE_URL)
// enforces INSERT-only access at the database level. The vault DB role should
// have INSERT granted and UPDATE/DELETE revoked — once a DeletedRecord row is
// written, even the application cannot alter or remove it.
//
// Requirements: docs/PRO-REQUIREMENTS.md §12.4, docs/SECURITY.md §19
// The test SKIPS itself when VAULT_DATABASE_URL is not set (dev/staging).

import { beforeAll, describe, expect, it } from 'vitest'
import { getVaultPrisma } from './vault.js'

const TEST_TABLE = 'deleted_records'

// Use a shared test record ID across all three operations to minimize
// leaked rows. Inserted once in beforeAll, tested for INSERT/UPDATE/DELETE
// in separate it() blocks. Since UPDATE/DELETE are rejected by design,
// the row will remain in the vault DB as a permanent artifact — this is
// expected and documented.
const TEST_SHARED_ID = `test-vault-perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Conditionally skip the entire suite when vault DB is not configured
const suite = process.env['VAULT_DATABASE_URL'] ? describe : describe.skip

suite('vault INSERT-only constraint', () => {
  let vault: Awaited<ReturnType<typeof getVaultPrisma>>

  beforeAll(async () => {
    vault = await getVaultPrisma()
    expect(vault).not.toBeNull()

    // Insert the shared test record
    // Note: $4::jsonb casts the text parameter to jsonb to match the column type
    const result = await vault!.$executeRawUnsafe(
      `INSERT INTO ${TEST_TABLE} (id, source_table, source_id, payload, delete_reason, deleted_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      TEST_SHARED_ID,
      'vault_perm_test',
      'permission_verification',
      JSON.stringify({
        test: true,
        description: 'INSERT-only permission verification — this row is a test artifact',
        created_at: new Date().toISOString(),
      }),
      'test',
      'vault-test-suite',
    )
    expect(result).toBe(1)
    console.log(`[vault-test] Inserted shared test entry ${TEST_SHARED_ID}`)
  }, 15000)

  it('UPDATE is rejected with a database permission error', async () => {
    let error: Error | null = null
    try {
      await vault!.$executeRawUnsafe(
        `UPDATE ${TEST_TABLE} SET delete_reason = $1 WHERE id = $2`,
        'attempted_update',
        TEST_SHARED_ID,
      )
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
    }

    expect(error).not.toBeNull()
    const msg = error?.message?.toLowerCase() ?? ''
    expect(
      msg.includes('permission denied') ||
        msg.includes('42501') ||
        msg.includes('no permission'),
    ).toBe(true)
    console.log(`[vault-test] UPDATE correctly rejected: ${error?.message}`)
  }, 15000)

  it('DELETE is rejected with a database permission error', async () => {
    let error: Error | null = null
    try {
      await vault!.$executeRawUnsafe(
        `DELETE FROM ${TEST_TABLE} WHERE id = $1`,
        TEST_SHARED_ID,
      )
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
    }

    expect(error).not.toBeNull()
    const msg = error?.message?.toLowerCase() ?? ''
    expect(
      msg.includes('permission denied') ||
        msg.includes('42501') ||
        msg.includes('no permission'),
    ).toBe(true)
    console.log(`[vault-test] DELETE correctly rejected: ${error?.message}`)
  }, 15000)
})
