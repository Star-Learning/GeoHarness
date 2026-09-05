import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_INTERVAL_MS = 250

export function detectScreenshotFormat(bytes) {
  if (
    bytes?.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { extension: '.png', mediaType: 'image/png' }
  }
  if (bytes?.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: '.jpg', mediaType: 'image/jpeg' }
  }
  throw new Error('Browser screenshot returned an unsupported image format')
}

export function frameName(index, extension) {
  return `frame-${String(index).padStart(6, '0')}${extension}`
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * Capture a fixed-rate chunk from a Browser-plugin Tab. This module is imported
 * and invoked inside the supported Browser runtime; it does not launch its own
 * browser or bypass Browser URL/confirmation policy.
 */
export async function captureFrames(tab, outputDirectory, options = {}) {
  const startIndex = options.startIndex ?? 1
  const count = options.count ?? 40
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new Error('startIndex must be a positive integer')
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')
  if (!Number.isInteger(intervalMs) || intervalMs < 100) throw new Error('intervalMs must be an integer >= 100')

  await mkdir(outputDirectory, { recursive: true })
  const startedAt = Date.now()
  const frames = []
  let screenshotFormat = null
  for (let offset = 0; offset < count; offset += 1) {
    const frameIndex = startIndex + offset
    const capturedAt = Date.now()
    const bytes = await tab.screenshot({ fullPage: options.fullPage ?? true })
    const currentFormat = detectScreenshotFormat(bytes)
    screenshotFormat ??= currentFormat
    if (currentFormat.extension !== screenshotFormat.extension) {
      throw new Error('Browser screenshot format changed during one recording chunk')
    }
    await writeFile(join(outputDirectory, frameName(frameIndex, screenshotFormat.extension)), bytes)
    frames.push({ index: frameIndex, timestampMs: capturedAt - startedAt })
    const nextDeadline = startedAt + (offset + 1) * intervalMs
    const remaining = nextDeadline - Date.now()
    if (remaining > 0) await delay(remaining)
  }
  return {
    firstFrame: startIndex,
    lastFrame: startIndex + count - 1,
    frameCount: count,
    intervalMs,
    frameExtension: screenshotFormat.extension,
    frameMediaType: screenshotFormat.mediaType,
    elapsedMs: Date.now() - startedAt,
    startedAt,
    frames,
  }
}

/** Repeat a single screenshot for an opening or closing hold. */
export async function captureHold(tab, outputDirectory, options = {}) {
  const startIndex = options.startIndex ?? 1
  const count = options.count ?? 12
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new Error('startIndex must be a positive integer')
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')

  await mkdir(outputDirectory, { recursive: true })
  const bytes = await tab.screenshot({ fullPage: options.fullPage ?? true })
  const screenshotFormat = detectScreenshotFormat(bytes)
  for (let offset = 0; offset < count; offset += 1) {
    await writeFile(join(outputDirectory, frameName(startIndex + offset, screenshotFormat.extension)), bytes)
  }
  return {
    firstFrame: startIndex,
    lastFrame: startIndex + count - 1,
    frameCount: count,
    frameExtension: screenshotFormat.extension,
    frameMediaType: screenshotFormat.mediaType,
  }
}

/** Read only the visible, non-secret execution state needed by the recorder. */
export async function inspectAgentState(tab) {
  return tab.playwright.evaluate(() => {
    const state = document.querySelector('.gh-agent-state')?.textContent?.trim().toLowerCase() ?? 'unknown'
    const steps = [...document.querySelectorAll('[data-step-status]')].map(element => ({
      id: element.getAttribute('data-step-id'),
      status: element.getAttribute('data-step-status'),
      text: element.textContent?.trim() ?? '',
    }))
    const layers = [...document.querySelectorAll('[data-layer-id]')].map(element => ({
      id: element.getAttribute('data-layer-id'),
      text: element.textContent?.trim() ?? '',
    }))
    return {
      state,
      steps,
      layers,
      goal: document.querySelector('.gh-agent-scroll .gh-agent-block p')?.textContent?.trim() ?? '',
      stream: document.querySelector('.gh-agent-result')?.textContent?.trim() ?? '',
      viewport: { width: window.innerWidth, height: window.innerHeight },
      capturedAt: new Date().toISOString(),
    }
  })
}

export async function writeRecordingManifest(path, manifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}
