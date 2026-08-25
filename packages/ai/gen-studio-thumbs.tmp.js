const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs')

const OUT_DIR = 'E:\\Kanchuki\\apps\\mobile\\assets\\studio-templates'

const templates = [
  { id: 'white_studio', stops: ['#ffffff', '#e9e4dc'] },
  { id: 'warm_luxury', stops: ['#d9b98a', '#8a6642'] },
  { id: 'gold_festive', stops: ['#f6d365', '#b8860b'] },
  { id: 'diwali_lights', stops: ['#ff9a56', '#8b2e00'] },
  { id: 'wedding_elegant', stops: ['#f6d9e0', '#c9a15a'] },
  { id: 'flat_lay', stops: ['#e8e2d4', '#b9ae95'] },
]

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const t of templates) {
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${t.stops[0]}"/>
            <stop offset="100%" stop-color="${t.stops[1]}"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="20" fill="url(#g)"/>
      </svg>`
    const outPath = path.join(OUT_DIR, `${t.id}.png`)
    await sharp(Buffer.from(svg)).png().toFile(outPath)
    console.log('wrote', outPath)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
