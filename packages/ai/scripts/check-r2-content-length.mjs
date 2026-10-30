// RC-080 owner check: does real R2 reject a PUT whose body length differs from the
// ContentLength signed into the presigned URL? Run by the OWNER with the R2 env vars
// set (prefer a dev/test bucket). Writes two throwaway keys under
// uploads/pending/_cl-check/ and deletes them afterwards.
//
//   cd packages/ai
//   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... \
//     node scripts/check-r2-content-length.mjs
//
// Expected: matching PUT -> 200, oversized PUT -> 403. Anything else: report the output;
// the post-hoc verifyUpload() check then remains the only size guard.
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')}`);
  process.exit(2);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.R2_BUCKET_NAME;
const stamp = Date.now();
const SIGNED = 1024;
const TYPE = 'application/octet-stream';

async function put(label, key, bodyBytes) {
  const url = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket, Key: key, ContentType: TYPE, ContentLength: SIGNED }),
    { expiresIn: 120 },
  );
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': TYPE },
    body: Buffer.alloc(bodyBytes, 1),
  });
  console.log(`${label}: signed ${SIGNED} B, sent ${bodyBytes} B -> HTTP ${res.status}`);
  return res.status;
}

const keyOk = `uploads/pending/_cl-check/${stamp}-ok.bin`;
const keyBig = `uploads/pending/_cl-check/${stamp}-big.bin`;
const ok = await put('matching ', keyOk, SIGNED);
const big = await put('oversized', keyBig, 5_000_000);

for (const Key of [keyOk, keyBig]) {
  await r2.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
}

const pass = ok === 200 && big >= 400 && big < 500;
console.log(pass ? 'PASS: R2 enforces the signed ContentLength.' : 'FAIL: R2 did NOT enforce it.');
process.exit(pass ? 0 : 1);
