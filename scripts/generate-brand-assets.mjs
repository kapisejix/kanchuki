#!/usr/bin/env node
/**
 * Kanchuki brand asset generator (Loom design system).
 *
 * Single source of truth for every raster brand image in apps/web:
 *   - apps/web/src/app/icon.svg        (Next.js file-convention favicon)
 *   - apps/web/public/favicon.ico      (legacy browsers that request /favicon.ico)
 *   - apps/web/src/app/apple-icon.png  (iOS home screen, 180x180)
 *   - apps/web/public/icons/icon-192.png, icon-512.png  (PWA manifest — repaints
 *     the stale pre-Loom cyan icons to ink/turmeric)
 *   - apps/web/public/og-image.png     (social share card, 1200x630)
 *
 * The mark mirrors KanchukiMark.tsx: an ink (#1E2A3D) tile with two interlaced
 * thread lines (white + turmeric #6E5742). Run from the repo root:
 *   node scripts/generate-brand-assets.mjs
 *
 * Requires `sharp` (bundled with Next.js).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps', 'web')

// ── Brand tokens (apps/web/tailwind.config.ts + globals.css) ────────────────
const INK = '#1E2A3D' // ink.600 default (navy)
const TURMERIC = '#6E5742' // turmeric.700 (tobacco brown — the mark's thread)
const COTTON = '#FBFAF8' // page background
const SAND_200 = '#E5E0D8' // sand-ish neutral for OG subtext (ink-200 approx)

/** The interlaced-thread mark — same two paths as KanchukiMark.tsx. */
const MARK = (stroke = 2.2) => `
  <path d="M5.6 5.6 L18.4 18.4" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="${stroke}" stroke-linecap="round"/>
  <path d="M18.4 5.6 L5.6 18.4" stroke="${TURMERIC}" stroke-width="${stroke}" stroke-linecap="round"/>
`

/** Rounded-tile favicon (browser tab chrome shows the rounded tile as-is). */
function faviconSvg(size = 24, radiusPct = 0.22) {
  const r = Math.round(size * radiusPct)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${INK}"/>
  ${MARK(2.4)}
</svg>`
}

/** Full-bleed tile (PWA maskable + iOS: the OS applies its own rounding). */
function fullBleedSvg(size = 512) {
  const m = Math.round(size * 0.6) // mark stays inside the maskable safe zone
  const off = (size - m) / 2
  const scale = m / 24 // map the 24-unit mark onto the m-unit safe zone
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <g transform="translate(${off} ${off}) scale(${scale})">
    ${MARK(2.4)}
  </g>
</svg>`
}

/** 1200x630 social share card — ink field, cotton tile + wordmark + tagline. */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${INK}"/>
  <!-- subtle top-left wash -->
  <rect width="1200" height="630" fill="url(#wash)"/>
  <defs>
    <radialGradient id="wash" cx="0.15" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- cotton tile with the ink/turmeric threads -->
  <rect x="534" y="96" width="132" height="132" rx="30" fill="${COTTON}"/>
  <g transform="translate(534 96) scale(5.5)">${MARK(1.0)}</g>

  <!-- wordmark -->
  <text x="600" y="352" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="#FFFFFF">Kanchuki</text>

  <!-- turmeric rule -->
  <rect x="552" y="392" width="96" height="5" rx="2.5" fill="${TURMERIC}"/>

  <!-- tagline -->
  <text x="600" y="452" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-style="italic" fill="${SAND_200}">AI-powered fashion collections for Indian clothing stores</text>

  <!-- domain -->
  <text x="600" y="560" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${TURMERIC}">kanchuki.app</text>
</svg>`
}

/** Wrap a PNG buffer in an ICO container (Vista+ PNG-in-ICO format). */
function pngToIco(pngBuffers) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngBuffers.length, 4) // count

  const entries = []
  let offset = 6 + 16 * pngBuffers.length
  for (const buf of pngBuffers) {
    const entry = Buffer.alloc(16)
    // width/height: 0 means 256; 16/32 are stored as-is
    entry.writeUInt8(buf.width > 255 ? 0 : buf.width, 0)
    entry.writeUInt8(buf.height > 255 ? 0 : buf.height, 1)
    entry.writeUInt8(0, 2) // color count
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit count
    entry.writeUInt32LE(buf.png.length, 8) // bytes in resource
    entry.writeUInt32LE(offset, 12) // image offset
    entries.push(entry)
    offset += buf.png.length
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((b) => b.png)])
}

async function main() {
  const out = (p) => join(WEB, p)

  // 1. icon.svg — the favicon Next.js serves at /icon.svg
  writeFileSync(out('src/app/icon.svg'), faviconSvg(24), 'utf8')

  // 2. favicon.ico — 16 + 32px PNGs inside an ICO container
  const ico16 = await sharp(Buffer.from(faviconSvg(24))).resize(16, 16).png().toBuffer()
  const ico32 = await sharp(Buffer.from(faviconSvg(24))).resize(32, 32).png().toBuffer()
  writeFileSync(out('public/favicon.ico'), pngToIco([
    { width: 16, height: 16, png: ico16 },
    { width: 32, height: 32, png: ico32 },
  ]))

  // 3. apple-icon.png — full-bleed (iOS rounds it)
  writeFileSync(
    out('src/app/apple-icon.png'),
    await sharp(Buffer.from(fullBleedSvg(180))).resize(180, 180).png().toBuffer(),
  )

  // 4. PWA icons — full-bleed + maskable-safe (mark inside the 80% safe zone)
  writeFileSync(
    out('public/icons/icon-192.png'),
    await sharp(Buffer.from(fullBleedSvg(192))).resize(192, 192).png().toBuffer(),
  )
  writeFileSync(
    out('public/icons/icon-512.png'),
    await sharp(Buffer.from(fullBleedSvg(512))).resize(512, 512).png().toBuffer(),
  )

  // 5. og-image.png — social share card
  writeFileSync(
    out('public/og-image.png'),
    await sharp(Buffer.from(ogSvg())).resize(1200, 630).png().toBuffer(),
  )

  console.log('Brand assets written:')
  console.log('  src/app/icon.svg')
  console.log('  public/favicon.ico (16+32px)')
  console.log('  src/app/apple-icon.png (180x180)')
  console.log('  public/icons/icon-192.png, icon-512.png')
  console.log('  public/og-image.png (1200x630)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
