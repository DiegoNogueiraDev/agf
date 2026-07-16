/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Startup banner: green bug crawling left→right, then tagline.
 * Runs only when stdout is a TTY (not in CI/pipe).
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'banner.ts' })

const GREEN = '\x1b[32m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const CLEAR_LINE = '\r\x1b[K'

const BUG_FRAMES = [' /\\(•‿•)/\\  ', ' /\\(•‿•)/\\  ', '  \\(•‿•)/   ', '  \\(•‿•)/   ', ' /\\(•‿•)/\\  ']

const TRAIL = '·'
const TAGLINE = 'mcp-graph-agent  —  Software Engineer as a Service'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function showBanner(): Promise<void> {
  log.info('showBanner start')
  if (!process.stdout.isTTY) return

  const cols = process.stdout.columns ?? 80
  const bugWidth = BUG_FRAMES[0].length
  const steps = Math.max(cols - bugWidth - 2, 10)
  let trail = ''

  for (let i = 0; i <= steps; i++) {
    const frame = BUG_FRAMES[i % BUG_FRAMES.length]
    const pad = ' '.repeat(i)
    process.stdout.write(`${CLEAR_LINE}${GREEN}${pad}${trail}${frame}${RESET}`)
    trail += TRAIL
    if (trail.length > i) trail = trail.slice(-i || 0)
    await sleep(28)
  }

  // Final line: bug at the right edge, tagline below
  process.stdout.write(`\n${CLEAR_LINE}${BOLD}${GREEN}${TAGLINE}${RESET}\n`)
  process.stdout.write(`${DIM}  'agf help' lista tudo · 'agf deliver "<pedido>"' entrega · '/help' na TUI${RESET}\n\n`)
}
