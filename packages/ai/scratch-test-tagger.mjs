import { readFile } from 'node:fs/promises'
import { tagProductImages } from './dist/tagger.js'

const mediaType = (f) => (f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'image/jpeg')

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scratch-test-tagger.mjs <image1> [image2] ...')
  process.exit(1)
}

for (const f of files) {
  const buffer = await readFile(f)
  console.log(`\n=== ${f} ===`)
  const result = await tagProductImages([{ buffer, mediaType: mediaType(f) }])
  console.log(JSON.stringify(result, null, 2))
}
