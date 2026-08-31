import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_INTERVAL_MS = 250

function frameName(index) {
  return `frame-${String(index).padStart(6, '0')}.png`
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
  for (let offset = 0; offset < count; offset += 1) {
    const frameIndex = startIndex + offset
    const bytes = await tab.screenshot({ fullPage: false })
    await writeFile(join(outputDirectory, frameName(frameIndex)), bytes)
    const nextDeadline = startedAt + (offset + 1) * intervalMs
    const remaining = nextDeadline - Date.now()
    if (remaining > 0) await delay(remaining)
  }
  return {
    firstFrame: startIndex,
    lastFrame: startIndex + count - 1,
    frameCount: count,
    intervalMs,
    elapsedMs: Date.now() - startedAt,
  }
}

/** Repeat a single screenshot for an opening or closing hold. */
export async function captureHold(tab, outputDirectory, options = {}) {
  const startIndex = options.startIndex ?? 1
  const count = options.count ?? 12
  if (!Number.isInteger(startIndex) || startIndex < 1) throw new Error('startIndex must be a positive integer')
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')

  await mkdir(outputDirectory, { recursive: true })
  const bytes = await tab.screenshot({ fullPage: false })
  for (let offset = 0; offset < count; offset += 1) {
    await writeFile(join(outputDirectory, frameName(startIndex + offset)), bytes)
  }
  return { firstFrame: startIndex, lastFrame: startIndex + count - 1, frameCount: count }
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
