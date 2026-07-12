// Exercises the real chained triggerTryOn() path (F-102) end-to-end against
// live RunPod, using the real DB-tagged upper/lower photos on product
// cmrfvyjmj0002sozgpti8j77p (Ladies Suit, category is PIECE_TAGGABLE).
// Run: node --env-file=.env packages/ai/scratch-test-multipiece.mjs
import { triggerTryOn, saveTryOnResultToR2 } from './dist/tryon.js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFile, writeFile } from 'node:fs/promises'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})
const BUCKET = process.env.R2_BUCKET_NAME
const PUBLIC_URL = process.env.R2_PUBLIC_URL

const personBuf = await readFile('E:/Kanchuki/test_person.jpg')
await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: 'scratch-test/person.jpg', Body: personBuf, ContentType: 'image/jpeg' }))
const customerPhotoUrl = `${PUBLIC_URL}/scratch-test/person.jpg`

const upperUrl = 'https://pub-d40b1f35e49e4797ac45781933ccd533.r2.dev/retailers/cmrf020c6000z13osff9jm2w2/products/o2gv017xul3qpm4d6wrfj945/t7jja51zgjd2s88d9jbhey91.jpg'
const lowerUrl = 'https://pub-d40b1f35e49e4797ac45781933ccd533.r2.dev/retailers/cmrf020c6000z13osff9jm2w2/products/oxh062xdg11abkztceqa67xx/e5ckgdp7yeuf3w8weyqv3xpx.jpg'

console.log('[1/2] calling triggerTryOn() with pieceGarmentUrls (2 chained RunPod calls, ~90-180s)...')
const started = Date.now()
const result = await triggerTryOn({
  customerPhotoUrl,
  productPhotoUrl: upperUrl, // fallback, unused when both piece URLs present
  productCategory: 'Ladies Suit',
  pieceGarmentUrls: { upper: upperUrl, lower: lowerUrl },
})
console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`, result)

if (result.outputUrls[0]) {
  console.log('[2/2] saving final result to R2 + local file...')
  const finalUrl = await saveTryOnResultToR2(`scratch-multipiece-${Date.now()}`, result.outputUrls[0])
  console.log('  R2 url:', finalUrl)
  const imgRes = await fetch(finalUrl)
  await writeFile('E:/Kanchuki/tryon-multipiece-result.jpg', Buffer.from(await imgRes.arrayBuffer()))
  console.log('  saved to E:/Kanchuki/tryon-multipiece-result.jpg')
}
