/**
 * Helper script to generate:
 *   - scrypt password hash for ADMIN_PASSWORD_HASH (scrypt: salt:hash format)
 *   - TOTP secret for ADMIN_TOTP_SECRET (base32, generates URI for authenticator app)
 *
 * Usage:
 *   npx tsx scripts/generate-admin-hash.ts <password>
 *   npx tsx scripts/generate-admin-hash.ts <password> --totp
 *   npx tsx scripts/generate-admin-hash.ts --totp-only
 */
import { randomBytes, scryptSync } from 'node:crypto'

function generatePasswordHash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function generateTotpSecret(): Promise<{ secret: string; uri: string }> {
  const { generateSecret, generateURI } = await import('otplib')
  const secret = generateSecret()
  const uri = generateURI({
    issuer: 'Kanchuki',
    label: 'admin',
    secret,
  })
  return { secret, uri }
}

async function main() {
  const args = process.argv.slice(2)
  const passwordArg = args.find((a) => !a.startsWith('--'))
  const totpFlag = args.includes('--totp')
  const totpOnly = args.includes('--totp-only')

  if (totpOnly) {
    const totp = await generateTotpSecret()
    console.log('\n─── TOTP (ADMIN_TOTP_SECRET) ───')
    console.log(`ADMIN_TOTP_SECRET="${totp.secret}"`)
    console.log(`\nAdd this URI to your authenticator app:\n${totp.uri}\n`)
    return
  }

  if (!passwordArg) {
    console.error('Usage:')
    console.error('  npx tsx scripts/generate-admin-hash.ts <password>')
    console.error('  npx tsx scripts/generate-admin-hash.ts <password> --totp')
    console.error('  npx tsx scripts/generate-admin-hash.ts --totp-only')
    process.exit(1)
  }

  const hash = generatePasswordHash(passwordArg)

  console.log('\n─── Password Hash (ADMIN_PASSWORD_HASH) ───')
  console.log(`ADMIN_PASSWORD_HASH="${hash}"`)
  console.log(`\n(Generated with password: ${passwordArg})`)

  if (totpFlag) {
    const totp = await generateTotpSecret()
    console.log('\n─── TOTP (ADMIN_TOTP_SECRET) ───')
    console.log(`ADMIN_TOTP_SECRET="${totp.secret}"`)
    console.log(`\nAdd this URI to your authenticator app:\n${totp.uri}\n`)
  } else {
    console.log('\n(Use --totp flag to also generate a TOTP secret)')
  }
}

main().catch(console.error)
