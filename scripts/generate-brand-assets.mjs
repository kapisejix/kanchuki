#!/usr/bin/env node
/**
 * Kanchuki brand asset generator ("K" mark, navy/red).
 *
 * Single source of truth for every raster brand image in apps/web:
 *   - apps/web/src/app/icon.svg        (Next.js file-convention favicon)
 *   - apps/web/public/favicon.ico      (legacy browsers that request /favicon.ico)
 *   - apps/web/src/app/apple-icon.png  (iOS home screen, 180x180)
 *   - apps/web/public/icons/icon-192.png, icon-512.png  (PWA manifest, purpose
 *     "any maskable" — must stay inside the maskable safe zone)
 *   - apps/web/public/og-image.png     (social share card, 1200x630)
 *
 * The mark is the user-supplied "K" logo (navy #09214F + red #BF1F2F dot),
 * authored at 512x512 with the visible content vertically inset (y 93-419).
 * Run from the repo root:
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
const INK = '#14213D' // card/background navy (matches mobile app.json)
const TURMERIC = '#6E5742' // turmeric.700 (tobacco brown — OG rule/tagline)
const COTTON = '#FBFAF8' // page background
const SAND_200 = '#E5E0D8' // sand-ish neutral for OG subtext (ink-200 approx)

// ── The "K" mark — raw paths from Frame 33827.svg, native viewBox 0 0 512 512.
// Visible content is only y:93-419 (326 tall) — the rest is built-in padding.
const K_MARK_PATHS = `
  <path d="M80.3137 203.258L171.671 93.0197H275.609L164.598 231.068C166.321 239.442 168.832 247.654 172.112 255.591C178.914 272.05 188.884 287.005 201.453 299.602C214.022 312.199 228.942 322.192 245.364 329.008C261.787 335.826 279.387 339.333 297.161 339.333C314.934 339.333 332.535 335.826 348.957 329.008C365.379 322.192 380.3 312.199 392.869 299.602C405.438 287.005 415.409 272.05 422.209 255.591C429.012 239.133 432.512 221.493 432.512 203.679H512C512 231.955 506.444 259.955 495.646 286.079C484.85 312.203 469.024 335.938 449.074 355.933C429.124 375.928 405.442 391.789 379.376 402.609C353.31 413.432 325.373 419 297.161 419C268.949 419 241.011 413.432 214.946 402.609C188.88 391.789 165.197 375.928 145.247 355.933C129.74 340.392 116.726 322.589 106.628 303.161L80.3137 335.884V410.951H0V93H80.3137V203.258Z" fill="#09214F"/>
  <path d="M375.467 173.494C397.645 173.494 415.624 155.475 415.624 133.247C415.624 111.019 397.645 93 375.467 93C353.289 93 335.31 111.019 335.31 133.247C335.31 155.475 353.289 173.494 375.467 173.494Z" fill="#BF1F2F"/>
`
const K_CONTENT_W = 512
const K_CONTENT_H = 326
const K_CONTENT_Y_OFFSET = 93

/** Group that fits the K mark into a `box`x`box` square inside `size`x`size`, centered. */
function kMarkGroup(size, safeFrac = 0.7) {
  const box = size * safeFrac
  const scale = Math.min(box / K_CONTENT_W, box / K_CONTENT_H)
  const renderedW = K_CONTENT_W * scale
  const renderedH = K_CONTENT_H * scale
  const x = (size - renderedW) / 2
  const y = (size - renderedH) / 2
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(0 -${K_CONTENT_Y_OFFSET})">${K_MARK_PATHS}</g>`
}

/** Favicon — the raw mark, transparent background (native viewBox already padded). */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${K_MARK_PATHS}</svg>`
}

/** Full-bleed tile on white (PWA maskable + iOS: the OS applies its own rounding/mask). */
function fullBleedSvg(size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#FFFFFF"/>
  ${kMarkGroup(size, 0.7)}
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

  <!-- cotton tile with the K mark -->
  <rect x="534" y="96" width="132" height="132" rx="30" fill="${COTTON}"/>
  <g transform="translate(534 96)">${kMarkGroup(132, 0.72)}</g>

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
  writeFileSync(out('src/app/icon.svg'), faviconSvg(), 'utf8')

  // 2. favicon.ico — 16 + 32px PNGs inside an ICO container
  const ico16 = await sharp(Buffer.from(faviconSvg())).resize(16, 16).png().toBuffer()
  const ico32 = await sharp(Buffer.from(faviconSvg())).resize(32, 32).png().toBuffer()
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
