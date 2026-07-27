/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { measureStreamTps } from '../core/llm/stream-tps.js'

async function* makeStream(chunks: string[], delayMs = 0): AsyncIterable<string> {
  for (const c of chunks) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    yield c
  }
}

async function* makeErrorStream(): AsyncIterable<string> {
  yield 'chunk1'
  throw new Error('stream error')
}

describe('measureStreamTps', () => {
  it('returns 0 for empty stream', async () => {
    const result = await measureStreamTps(makeStream([]))
    expect(result.tokenCount).toBe(0)
    expect(result.tps).toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('counts tokens from single chunk', async () => {
    const result = await measureStreamTps(makeStream(['hello'], 1))
    expect(result.tokenCount).toBe(1)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('counts tokens from multiple chunks', async () => {
    const result = await measureStreamTps(makeStream(['a', 'b', 'c', 'd', 'e']))
    expect(result.tokenCount).toBe(5)
  })

  it('handles interrupted stream gracefully', async () => {
    const result = await measureStreamTps(makeErrorStream())
    expect(result.tokenCount).toBe(1)
  })

  it('tps is a number (may be 0 for synchronous streams)', async () => {
    const result = await measureStreamTps(makeStream(['x']))
    expect(typeof result.tps).toBe('number')
  })
})
