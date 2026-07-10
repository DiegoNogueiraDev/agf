/*!
 * Tests for LiveRunResult contract (node_f50928dc8680)
 * AC:
 *   - Given no provider, /run returns mode:delegated and does not throw
 *   - LiveRunResult type has mode: 'live' | 'delegated'
 */

import { describe, it, expect } from 'vitest'
import { buildLiveRunResult, type LiveRunResult } from '../tui/live-run-result.js'

describe('LiveRunResult', () => {
  it('delegated mode returns mode:delegated without throwing', async () => {
    const result = await buildLiveRunResult({
      prompt: 'hello world',
      available: false,
      implement: async () => {
        throw new Error('should not be called')
      },
    })
    expect(result.mode).toBe('delegated')
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it('live mode calls implement and returns mode:live', async () => {
    let called = false
    const result = await buildLiveRunResult({
      prompt: 'hello world',
      available: true,
      implement: async () => {
        called = true
        return 'live-response'
      },
    })
    expect(result.mode).toBe('live')
    expect(called).toBe(true)
    expect(result.summary).toContain('live-response')
  })

  it('live mode implement failure surfaces as delegated fallback (does not throw)', async () => {
    const result = await buildLiveRunResult({
      prompt: 'fail prompt',
      available: true,
      implement: async () => {
        throw new Error('LLM error')
      },
    })
    expect(result.mode).toBe('delegated')
    expect(result.summary).toMatch(/erro|error|delegated/i)
  })
})

describe('LiveRunResult type shape', () => {
  it('has required fields', () => {
    const r: LiveRunResult = { mode: 'live', summary: 'ok' }
    expect(r.mode).toBe('live')
    const d: LiveRunResult = { mode: 'delegated', summary: 'delegated' }
    expect(d.mode).toBe('delegated')
  })
})
