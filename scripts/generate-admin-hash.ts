/**
 * Helper script to generate the scrypt password hash for ADMIN_PASSWORD_HASH
 * (scrypt: salt:hash format).
 *
 * Usage:
 *   npx tsx scripts/generate-admin-hash.ts <password>
 */
import { randomBytes, scryptSync } from 'node:crypto';

function generatePasswordHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function main() {
  const args = process.argv.slice(2);
  const passwordArg = args.find((a) => !a.startsWith('--'));

  if (!passwordArg) {
    console.error('Usage:');
    console.error('  npx tsx scripts/generate-admin-hash.ts <password>');
    process.exit(1);
  }

  const hash = generatePasswordHash(passwordArg);

  console.log('\n─── Password Hash (ADMIN_PASSWORD_HASH) ───');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
  console.log(`\n(Generated with password: ${passwordArg})`);
}

main();
