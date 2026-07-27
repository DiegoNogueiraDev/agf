/*!
 * Tests for agf compress run subcommand.
 * Exercises the CLI action via buildCompressRunPayload (pure, testable).
 */

import { describe, it, expect } from 'vitest'
import { buildCompressRunPayload } from '../cli/commands/compress-cmd.js'

describe('buildCompressRunPayload', () => {
  it('compresses raw text and returns token metrics', () => {
    const raw = 'output line\n'.repeat(100)
    const result = buildCompressRunPayload(raw)
    expect(result.compressed).toBeDefined()
    expect(result.tokens.before).toBeGreaterThan(0)
    expect(result.tokens.after).toBeGreaterThanOrEqual(0)
    expect(typeof result.lossless).toBe('boolean')
  })

  it('returns saved=0 when raw is below compression threshold', () => {
    const raw = 'hi'
    const result = buildCompressRunPayload(raw)
    expect(result.compressed).toBe('hi')
    expect(result.tokens.saved).toBe(0)
  })

  it('passes through unchanged when noCompress=true', () => {
    const raw = 'x\n'.repeat(200)
    const result = buildCompressRunPayload(raw, { noCompress: true })
    expect(result.compressed).toBe(raw)
    expect(result.tokens.saved).toBe(0)
  })
})
