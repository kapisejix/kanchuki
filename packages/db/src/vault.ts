// F-016 Deletion Vault — stores full-payload snapshots of every soft-deleted record
// in a genuinely separate Postgres instance (VAULT_DATABASE_URL).
//
// The vault DB role is INSERT-only — even the application cannot UPDATE or DELETE
// a vault entry once written. This makes the vault tamper-resistant by permission,
// independent of trusting the application to "get it right."
//
// Full requirements: docs/PRO-REQUIREMENTS.md §12.4
// Guardrail design: docs/SECURITY.md §19

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VaultClient = any;

let _vaultClient: VaultClient | null = null;
let _initAttempted = false;

/**
 * Lazy-init vault PrismaClient. Only connects when VAULT_DATABASE_URL is set
 * (no crash in dev/staging without a vault DB). Async because the vault client
 * module is loaded via dynamic import() since the generated PrismaClient lives
 * in a separate schema and directory from the primary PrismaClient.
 */
async function getVaultClient(): Promise<VaultClient | null> {
  if (_vaultClient) return _vaultClient;
  if (_initAttempted) return null; // Don't retry a failed init
  _initAttempted = true;

  if (!process.env['VAULT_DATABASE_URL']) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[vault] VAULT_DATABASE_URL not set — vault writes will be skipped');
    }
    return null;
  }

  try {
    // Dynamic import because the vault Prisma client is generated from a
    // separate schema (vault-schema.prisma) into packages/db/src/generated/vault/.
    // This avoids requiring VAULT_DATABASE_URL during the main prisma generate.
    // The vault client is now generated (see postinstall or db:generate:vault),
    // so TypeScript resolves it correctly — the @ts-expect-error is no longer needed.
    const { PrismaClient } = await import('./generated/vault/index.js');
    _vaultClient = new PrismaClient({
      datasources: { db: { url: process.env['VAULT_DATABASE_URL'] } },
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    });
    return _vaultClient;
  } catch (err) {
    console.error('[vault] Failed to initialize vault PrismaClient:', err);
    return null;
  }
}

export interface VaultDeleteParams {
  /** Name of the source table, e.g. "products", "customers" */
  source_table: string;
  /** Primary key of the record being soft-deleted */
  source_id: string;
  /** Retailer that owns this record (may be null for platform-level records) */
  retailer_id?: string;
  /** Full row payload as a plain object — should contain all columns */
  payload: Record<string, unknown>;
  /** Why the record was deleted: "user_delete" | "admin_bulk_delete" | "purge" */
  delete_reason?: string;
  /** Who performed the deletion (retailer id, staff id, or admin) */
  deleted_by?: string;
}

/**
 * Get the vault PrismaClient for read access. Returns null if vault is not configured.
 * Used by admin routes to query the vault DB (read-only).
 */
export async function getVaultPrisma(): Promise<VaultClient | null> {
  return getVaultClient();
}

/**
 * Write a deletion snapshot to the vault database.
 *
 * This is fire-and-forget by design — a vault write failure (DB not configured,
 * network issue, permission denied) never blocks or fails the primary operation.
 * The primary operation (soft-delete in the main DB) is always the authoritative
 * action; the vault is an independent safety copy.
 *
 * In production, VAULT_DATABASE_URL must point to a Postgres instance where
 * the application's DB role has INSERT-only grants (no UPDATE, no DELETE).
 */
export async function vaultDelete(params: VaultDeleteParams): Promise<void> {
  const client = await getVaultClient();
  if (!client) return; // Vault not configured — silently skip

  try {
    await client.deletedRecord.create({
      data: {
        source_table: params.source_table,
        source_id: params.source_id,
        retailer_id: params.retailer_id ?? null,
        payload: params.payload as Record<string, unknown>,
        delete_reason: params.delete_reason ?? null,
        deleted_by: params.deleted_by ?? null,
      },
    });
  } catch (err) {
    // Vault write failure must NEVER bubble up — the primary operation already
    // succeeded. Log and move on.
    console.error('[vault] write failed:', err);
  }
}
