#!/usr/bin/env node
/**
 * Mobile app icon + splash (Black & Gold Elegance brand — navy #14213D /
 * gold #FCA311, same mark as apps/web/src/app/icon.svg). Writes:
 *   - apps/mobile/assets/icon.png            (1024x1024, full-bleed — iOS + legacy Android)
 *   - apps/mobile/assets/adaptive-icon.png    (1024x1024, transparent, mark in safe zone — Android adaptive)
 *   - apps/mobile/assets/splash-icon.png      (512x512, transparent — expo splash)
 * Run: node scripts/generate-mobile-brand-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'apps', 'mobile', 'assets')

const NAVY = '#14213D'
const GOLD = '#FCA311'

const mark = (stroke) => `
  <path d="M5.6 5.6 L18.4 18.4" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="${stroke}" stroke-linecap="round"/>
  <path d="M18.4 5.6 L5.6 18.4" stroke="${GOLD}" stroke-width="${stroke}" stroke-linecap="round"/>
`

// Full-bleed navy tile — iOS/legacy Android apply their own rounding.
const iconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  <g transform="translate(${size * 0.2} ${size * 0.2}) scale(${(size * 0.6) / 24})">${mark(2.4)}</g>
</svg>`

// Transparent, mark inside Android's ~66% adaptive-icon safe zone.
const adaptiveSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${size * 0.33} ${size * 0.33}) scale(${(size * 0.34) / 24})">${mark(2.4)}</g>
</svg>`

async function main() {
  mkdirSync(OUT, { recursive: true })

  writeFileSync(
    join(OUT, 'icon.png'),
    await sharp(Buffer.from(iconSvg(1024))).resize(1024, 1024).png().toBuffer(),
  )
  writeFileSync(
    join(OUT, 'adaptive-icon.png'),
    await sharp(Buffer.from(adaptiveSvg(1024))).resize(1024, 1024).png().toBuffer(),
  )
  writeFileSync(
    join(OUT, 'splash-icon.png'),
    await sharp(Buffer.from(adaptiveSvg(512))).resize(512, 512).png().toBuffer(),
  )

  console.log('Mobile brand assets written to apps/mobile/assets/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
