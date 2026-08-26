import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsDir = path.resolve(__dirname, '../apps/mobile/assets')
const logoPath = path.join(assetsDir, 'k-icon.png')

async function generateIcons() {
  console.log('Reading source logo from:', logoPath)

  // 1. icon.png (1024x1024, pure white background, logo scaled to 700x700 with padding)
  const logoForIcon = await sharp(logoPath)
    .resize(700, 700, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logoForIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(assetsDir, 'icon.png'))

  console.log('Generated icon.png with 160px padding on #FFFFFF')

  // 2. adaptive-icon.png (1024x1024, centered within Android adaptive launcher safe zone 520x520)
  const logoForAdaptive = await sharp(logoPath)
    .resize(520, 520, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logoForAdaptive, gravity: 'center' }])
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'))

  console.log('Generated adaptive-icon.png with Android safe zone padding on #FFFFFF')
}

generateIcons().catch(console.error)

