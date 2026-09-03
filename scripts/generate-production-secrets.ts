/**
 * One-shot generator for every secret the LAUNCH-READINESS-AUDIT lists as
 * missing/weak (docs/LAUNCH-READINESS-AUDIT.md §3 + §5, omp-review B and S items).
 *
 * Usage:
 *   npx tsx scripts/generate-production-secrets.ts
 *
 * Prints every value as KEY="value" — copy-paste into Railway (API service)
 * and the Web app where noted. Each secret is a fresh 48-hex random string
 * (192 bits) unless the docs specify another format. NOTHING is written to
 * disk or to .env — output only, so nothing leaks into git by accident.
 *
 * After this, the remaining manual steps are:
 *   - ADMIN_PASSWORD_HASH / ADMIN_TOTP_SECRET: use generate-admin-hash.ts
 *   - RAZORPAY_WEBHOOK_SECRET: set per-retailer in Admin → Integrations (F-012)
 *     AND the platform-level value here if billing webhooks use it
 *   - Rotate the dev-exposed keys (ANTHROPIC/OPENAI/GEMINI/Supabase/R2/Redis)
 *   - Point DATABASE_URL at kanchuki_app, DATABASE_URL_REPLICA at a real
 *     replica, VAULT_DATABASE_URL at the vault instance (INSERT-only role)
 */
import { randomBytes } from 'node:crypto';

function secret(): string {
  return randomBytes(24).toString('hex'); // 48 chars, 192 bits
}

function main(): void {
  const vars: Array<{ key: string; value: string; note: string }> = [
    {
      key: 'COOKIE_SECRET',
      value: secret(),
      note: 'API — admin CSRF cookie signing. index.ts throws at startup in production without this.',
    },
    {
      key: 'ADMIN_API_KEY',
      value: secret(),
      note: 'API — admin panel bearer token for /v1/admin/*.',
    },
    {
      key: 'TEAM_JWT_SECRET',
      value: secret(),
      note: 'API — team/staff session tokens. Team login is broken until set (B-008).',
    },
    {
      key: 'REVALIDATION_SECRET',
      value: secret(),
      note: 'API AND Web — must match between both services for ISR cache purges (B-009).',
    },
    {
      key: 'ENCRYPTION_MASTER_KEY',
      value: secret(),
      note: 'API — F-012 unlocks Admin → Integrations secrets. Can never be changed later (existing ciphertext).',
    },
    {
      key: 'RAZORPAY_WEBHOOK_SECRET',
      value: secret(),
      note: 'API — replaces the weak dictionary value (S-009). Also set per-retailer in Admin → Integrations.',
    },
  ];

  console.log('Kanchuki — production secrets (fresh random, 192-bit hex each)\n');
  console.log('Add the following to the API service Railway environment:\n');
  for (const v of vars) {
    console.log(`${v.key}="${v.value}"  # ${v.note}`);
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('STILL MANUAL (see docs/LAUNCH-READINESS-AUDIT.md §5):');
  console.log('  1. ADMIN_PASSWORD_HASH: npx tsx scripts/generate-admin-hash.ts <password>');
  console.log('  2. Rotate dev-exposed keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,');
  console.log('     SUPABASE_SERVICE_KEY, R2_SECRET_ACCESS_KEY, REDIS_URL password.');
  console.log('  3. DATABASE_URL → kanchuki_app role (test on staging first).');
  console.log('  4. DATABASE_URL_REPLICA → real read replica (B-002).');
  console.log('  5. VAULT_DATABASE_URL → vault instance, INSERT-only role (B-005).');
  console.log('  6. WEB_URL → real domain (collection links currently use LAN IP).');
  console.log('──────────────────────────────────────────────────');
  console.log('\nWARNING: output above contains live secrets — do not paste into git/chat logs.');
}

main();
