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

async function uploadBuffer(key, buffer, contentType) {
  await r2.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }),
  )
  return `${PUBLIC_URL}/${key}`
}

console.log('[1/3] uploading test images to R2...')
const personBuf = await readFile('E:/Kanchuki/test_person.jpg')
const garmentBuf = await readFile('E:/Kanchuki/test_garment.jpg')

const personUrl = await uploadBuffer('scratch-test/person.jpg', personBuf, 'image/jpeg')
const garmentUrl = await uploadBuffer('scratch-test/garment.jpg', garmentBuf, 'image/jpeg')
console.log('  person:', personUrl)
console.log('  garment:', garmentUrl)

console.log('[2/3] calling CatVTON via RunPod (cold start + inference, can take 60-90s)...')
const endpoint = `${process.env.CATVTON_API_URL}/runsync`
const started = Date.now()
const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
  },
  body: JSON.stringify({
    input: { person_image_url: personUrl, garment_image_url: garmentUrl },
  }),
})
console.log(`  HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
const json = await res.json()
console.log(JSON.stringify(json, null, 2))

const resultUrl = json.output?.result_url
if (resultUrl) {
  console.log('[3/3] downloading result...')
  const imgRes = await fetch(resultUrl)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  await writeFile('E:/Kanchuki/tryon-result.jpg', buf)
  console.log('  saved to E:/Kanchuki/tryon-result.jpg')
} else {
  console.log('  no result_url in response — see error above')
}
