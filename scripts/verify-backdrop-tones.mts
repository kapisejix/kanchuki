// Verify the generated starter backdrops classify through the REAL
// isDarkImage() the admin upload route uses (admin-media.ts), not hand math.
import { readFileSync } from 'node:fs';
import { isDarkImage, imageLuminance } from '../packages/ai/src/index.js';

const files = [
  ['scripts/demo/2026-08-08-starter-backdrops/backdrop-light-1600x2000.jpg', 'light (expect luminance > 0.6)'],
  ['scripts/demo/2026-08-08-starter-backdrops/backdrop-dark-1600x2000.jpg', 'dark (expect luminance < 0.35)'],
];

for (const [path, expect] of files) {
  const buf = readFileSync(path);
  const lum = await imageLuminance(buf);
  const dark = await isDarkImage(buf);
  const verdict = dark === true ? 'DARK' : dark === false ? 'LIGHT' : 'UNCLASSIFIED';
  console.log(`${path.split('/').pop()}: luminance=${lum.toFixed(3)} isDarkImage=${verdict} (${expect})`);
}
