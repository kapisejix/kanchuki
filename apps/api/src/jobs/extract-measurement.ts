import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { prisma } from '@kanchuki/db'
import { deleteObject, downloadBuffer } from '@kanchuki/ai'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

// ponytail: repo has one Python CV script; shelling out beats standing up a
// second runtime/service for it. Revisit if more Python jobs show up.
const PYTHON_BIN = process.env['PYTHON_BIN'] ?? (process.platform === 'win32' ? 'python' : 'python3')
const SCRIPT_PATH =
  process.env['MEASUREMENT_SCRIPT_PATH'] ??
  resolve(__dirname, '../../../../scripts/measurement_extractor.py')

export interface MeasurementJobData {
  measurement_id: string
  front_r2_key: string
  back_r2_key: string
  height_cm: number
}

interface ExtractorOutput {
  bust_cm: number
  waist_cm: number
  hip_cm: number
  pant_waist_cm: number
  pant_hip_cm: number
  inseam_cm: number
  confidence_score: number
}

export async function handleExtractMeasurement(data: MeasurementJobData): Promise<void> {
  const { measurement_id, front_r2_key, back_r2_key, height_cm } = data
  const dir = await mkdtemp(join(tmpdir(), 'kanchuki-measurement-'))
  const frontPath = join(dir, 'front.jpg')
  const backPath = join(dir, 'back.jpg')

  try {
    const [frontBuf, backBuf] = await Promise.all([
      downloadBuffer(front_r2_key),
      downloadBuffer(back_r2_key),
    ])
    await Promise.all([writeFile(frontPath, frontBuf), writeFile(backPath, backBuf)])

    const { stdout } = await execFileAsync(PYTHON_BIN, [
      SCRIPT_PATH,
      '--front',
      frontPath,
      '--back',
      backPath,
      '--height-cm',
      String(height_cm),
    ])
    const result = JSON.parse(stdout) as ExtractorOutput

    await prisma.customerMeasurement.update({
      where: { id: measurement_id },
      data: {
        bust_cm: result.bust_cm,
        waist_cm: result.waist_cm,
        hip_cm: result.hip_cm,
        pant_waist_cm: result.pant_waist_cm,
        pant_hip_cm: result.pant_hip_cm,
        inseam_cm: result.inseam_cm,
        confidence_score: result.confidence_score,
        photo_deleted_at: new Date(),
      },
    })

    // ephemeral rule (docs/DATABASE.md retention policy) — originals gone
    // right after landmark extraction, either deletion succeeding alone is fine
    await Promise.allSettled([deleteObject(front_r2_key), deleteObject(back_r2_key)])
  } catch (err) {
    console.error(`[jobs] extract-measurement failed ${measurement_id}:`, err)
    throw err // re-throw so BullMQ records the failure and retries
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
