#!/usr/bin/env node
// meta-android-key-hash.mjs — produce the value Meta's "Android key hashes"
// field actually wants.
//
// WHAT META WANTS vs WHAT EVERYTHING ELSE SHOWS
//   Meta:            base64( SHA-1( DER bytes of the signing certificate ) )
//   Play Console:    the SHA-1 as colon-separated HEX
//   `eas credentials`: also colon-separated HEX
//   keytool:         also hex
// So the usual blocker is a format conversion, not a missing value. This script
// does that conversion and can also pull the certificate straight out of a JKS.
//
// WHY A JKS NEEDS NO PASSWORD HERE
//   In the JKS container the certificate chain is stored as PLAINTEXT DER — only
//   the private key bytes are encrypted. The signing certificate is public data
//   (it ships in every APK), so reading it needs no secret. That matters because
//   the Android release builds happen in CI, so a dev machine often has no JDK
//   at all and `keytool` is not an option.
//
// USAGE
//   node scripts/meta-android-key-hash.mjs --keystore <file.jks>
//   node scripts/meta-android-key-hash.mjs --sha1 "AB:CD:EF:..."
//   node scripts/meta-android-key-hash.mjs --apk <file.apk>
//
// Output is safe to paste into a bug report — it prints no secrets, and never
// reads (or needs) a keystore password.

import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const JKS_MAGIC = 0xfeedfeed;
const PRIVATE_KEY_TAG = 1;
const TRUSTED_CERT_TAG = 2;

/** Meta's key hash format: base64 of the SHA-1 over the certificate's DER. */
const metaKeyHash = (der) => createHash('sha1').update(der).digest('base64');

/** Play Console / keytool format, for cross-checking against what they display. */
const hexSha1 = (der) => createHash('sha1').update(der).digest('hex').toUpperCase().match(/../g).join(':');

function readUtf(buf, offset) {
  const length = buf.readUInt16BE(offset);
  return { value: buf.toString('utf8', offset + 2, offset + 2 + length), next: offset + 2 + length };
}

/**
 * Parse a Java KeyStore. Returns one entry per alias with its certificate chain
 * (leaf first) as DER buffers.
 *
 * v2 entries carry a certType ("X.509") before each certificate; v1 does not.
 * Both EAS-generated keystores here are v2, but v1 is handled so the script
 * doesn't silently misread an older file.
 */
function parseJks(buf) {
  if (buf.length < 12 || buf.readUInt32BE(0) !== JKS_MAGIC) {
    throw new Error('not a JKS file (bad magic) — use --sha1 with a SHA-1 from Play Console or `eas credentials`');
  }
  const version = buf.readUInt32BE(4);
  if (version !== 1 && version !== 2) throw new Error(`unsupported JKS version ${version}`);
  const count = buf.readUInt32BE(8);

  let offset = 12;
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    const tag = buf.readUInt32BE(offset);
    offset += 4;
    const alias = readUtf(buf, offset);
    offset = alias.next;
    offset += 8; // timestamp (Java long, ms)

    const certs = [];

    if (tag === PRIVATE_KEY_TAG) {
      const keyLength = buf.readUInt32BE(offset);
      offset += 4;
      offset += keyLength; // encrypted private key — deliberately skipped
      const chainLength = buf.readUInt32BE(offset);
      offset += 4;
      for (let c = 0; c < chainLength; c += 1) {
        if (version === 2) {
          const certType = readUtf(buf, offset);
          offset = certType.next;
        }
        const certLength = buf.readUInt32BE(offset);
        offset += 4;
        certs.push(buf.subarray(offset, offset + certLength));
        offset += certLength;
      }
      entries.push({ tag: 'private key', alias: alias.value, certs });
    } else if (tag === TRUSTED_CERT_TAG) {
      if (version === 2) {
        const certType = readUtf(buf, offset);
        offset = certType.next;
      }
      const certLength = buf.readUInt32BE(offset);
      offset += 4;
      certs.push(buf.subarray(offset, offset + certLength));
      offset += certLength;
      entries.push({ tag: 'trusted cert', alias: alias.value, certs });
    } else {
      throw new Error(`unknown JKS entry tag ${tag} at offset ${offset - 4}`);
    }
  }

  // A JKS ends with a 20-byte SHA-1 integrity digest. If entries parse to
  // exactly (file length − 20), the offsets above were read correctly — a
  // structural proof that costs nothing and catches a misread container.
  return { version, entries, bytesConsumed: offset };
}

/** `apksigner verify --print-certs` prints hex; needs a JDK, so it's a fallback. */
function sha1FromApk(apkPath) {
  const output = execFileSync('apksigner', ['verify', '--print-certs', apkPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const match = output.match(/certificate SHA-1 digest:\s*([0-9a-fA-F:]+)/);
  if (!match) throw new Error('apksigner ran but no SHA-1 digest was found in its output');
  return match[1];
}

/** Accepts `AB:CD:EF`, `abcdef`, or `AB CD EF` — anything with 40 hex digits in it. */
function hexToMetaHash(raw) {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 40) {
    throw new Error(`expected a 40-character SHA-1 hex string, got ${hex.length} hex digits`);
  }
  return { hex: hex.toUpperCase().match(/../g).join(':'), meta: Buffer.from(hex, 'hex').toString('base64') };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[(i += 1)];
  }
  return args;
}

function reportCert(der, label) {
  const cert = new X509Certificate(der);
  const hex = hexSha1(der);
  const meta = metaKeyHash(der);

  // Cross-check 1: Node's own X.509 fingerprint must agree with hashing the DER
  // we extracted. If these disagree we misread the container and the value is junk.
  const fromNode = cert.fingerprint.replace(/[^0-9a-fA-F]/g, '').toUpperCase().match(/../g).join(':');
  const consistent = fromNode === hex;

  // Cross-check 2 (the strong one): a signing key's certificate is self-signed,
  // so its signature must verify against its own public key. A truncated or
  // mis-offset read cannot pass this.
  let selfSigned = false;
  try {
    selfSigned = cert.verify(cert.publicKey);
  } catch {
    selfSigned = false;
  }

  const subject = cert.subject.replace(/\n/g, ' | ').replace(/^(\s*\|\s*)+/, '') || '<empty DN>';

  console.log(`${label}`);
  console.log(`  subject:        ${subject}`);
  console.log(`  valid:          ${cert.validFrom} → ${cert.validTo}`);
  console.log(`  key:            ${cert.publicKey.asymmetricKeyType} ${cert.publicKey.asymmetricKeyDetails?.modulusLength ?? ''}`.trimEnd());
  console.log(`  SHA-1 (hex):    ${hex}`);
  console.log(`  META KEY HASH:  ${meta}`);
  console.log(`  integrity:      ${consistent ? 'ok (fingerprint matches Node X.509)' : 'MISMATCH — do not use'}`);
  console.log(`  self-signed:    ${selfSigned ? 'verified against its own public key' : 'NOT verified — do not use'}`);
  console.log('');
  return { hex, meta, consistent, selfSigned };
}

const args = parseArgs(process.argv);

if (args.keystore) {
  if (!existsSync(args.keystore)) throw new Error(`no such file: ${args.keystore}`);
  const buf = readFileSync(args.keystore);
  const isJks = buf.length >= 4 && buf.readUInt32BE(0) === JKS_MAGIC;

  console.log(`\nkeystore: ${args.keystore}`);
  console.log(`container: ${isJks ? 'JKS (certificate read natively — no password needed)' : 'not JKS'}\n`);

  if (!isJks) {
    console.log('This is a PKCS#12 container: the certificate is inside the encrypted');
    console.log('blob, so the password *is* required and this script cannot skip it.');
    console.log('Run one of these instead, then feed the hex back in with --sha1:\n');
    console.log(`  keytool -list -v -keystore "${args.keystore}" -alias <alias>   # then copy the SHA1 line`);
    console.log(`  npx eas credentials -p android                                  # SHA-1 fingerprint\n`);
    process.exit(1);
  }

  const { version, entries, bytesConsumed } = parseJks(buf);
  const trailing = buf.length - bytesConsumed;
  console.log(`JKS version ${version}, ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`);
  console.log(
    `structure: parsed ${bytesConsumed}/${buf.length} bytes, ${trailing} trailing — ${trailing === 20 ? 'ok (the 20-byte JKS integrity digest)' : 'UNEXPECTED, treat the value below with suspicion'}\n`,
  );

  const results = [];
  for (const entry of entries) {
    entry.certs.forEach((der, index) => {
      results.push(
        reportCert(der, `alias "${entry.alias}" (${entry.tag})${index === 0 ? '' : ` — chain cert ${index}`}`),
      );
    });
  }

  if (results.length > 1) {
    console.log('Use the FIRST (leaf) certificate per alias — the rest are the issuing chain.');
    console.log('Adding every alias below is harmless; Meta accepts a list.\n');
  }
  for (const r of results) {
    console.log(`  ${r.meta}`);
  }

  // A JAR signature block is named after the first 8 characters of the alias, so
  // you can confirm which key produced a shipped artifact without any tooling:
  // look for META-INF/<this>.RSA inside the .apk / .aab.
  for (const entry of entries) {
    console.log(
      `\ncheck a shipped artifact: a build signed by alias "${entry.alias}" carries META-INF/${entry.alias.slice(0, 8).toUpperCase()}.RSA`,
    );
  }
  console.log('\nPaste those into: Meta app → Settings → Basic → Android → Key hashes → Save changes.');
  console.log('Do NOT paste the hex form — Meta rejects it.\n');
} else if (args.sha1) {
  const { hex, meta } = hexToMetaHash(args.sha1);
  console.log(`\n  SHA-1 (hex):    ${hex}`);
  console.log(`  META KEY HASH:  ${meta}\n`);
  console.log('Paste the META KEY HASH into Meta app → Settings → Basic → Android → Key hashes.\n');
} else if (args.apk) {
  if (!existsSync(args.apk)) throw new Error(`no such file: ${args.apk}`);
  console.log(`\napk: ${args.apk}`);
  let hex;
  try {
    hex = sha1FromApk(args.apk);
  } catch (err) {
    console.log('\napksigner is unavailable (it ships with the Android SDK build-tools and needs a JDK).');
    console.log('Either install a JDK, or read the SHA-1 from Play Console → App signing,');
    console.log('then re-run with: --sha1 "<the hex you copied>"\n');
    throw err;
  }
  const { meta } = hexToMetaHash(hex);
  console.log(`  SHA-1 (hex):    ${hex}`);
  console.log(`  META KEY HASH:  ${meta}\n`);
} else {
  console.log(`
meta-android-key-hash.mjs — produce Meta's "Android key hashes" value

  node scripts/meta-android-key-hash.mjs --keystore <file.jks>
  node scripts/meta-android-key-hash.mjs --sha1 "AB:CD:EF:..."
  node scripts/meta-android-key-hash.mjs --apk <file.apk>

Meta wants base64(SHA-1(DER certificate)). Play Console and \`eas credentials\`
show the same SHA-1 as hex, which Meta rejects — --sha1 converts it.

Then: Meta app → Settings → Basic → Android → Key hashes.
See docs/META-FACEBOOK-LOGIN-SETUP.md §3.
`);
}
