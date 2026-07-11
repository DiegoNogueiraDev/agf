/*!
 * Tests for src/core/exec/run-compress.ts
 * Verifies compressOutput and runAndCompress with injected dependencies.
 */

import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { compressOutput, runAndCompress } from '../core/exec/run-compress.js'
import { CcrStore } from '../core/economy/ccr-store.js'

function makeDb() {
  return new Database(':memory:')
}

describe('compressOutput', () => {
  it('returns compressed output with token metrics', () => {
    const raw = 'hello world '.repeat(50)
    const db = makeDb()
    const ccr = new CcrStore(db)
    const result = compressOutput(raw, ccr)
    expect(result.tokensBefore).toBeGreaterThan(0)
    expect(result.tokensAfter).toBeGreaterThanOrEqual(0)
    expect(result.compressed).toBeDefined()
    expect(typeof result.lossless).toBe('boolean')
  })

  it('works without a CcrStore (null)', () => {
    const raw = 'short text'
    const result = compressOutput(raw, null)
    expect(result.compressed).toBeDefined()
    expect(result.tokensBefore).toBeGreaterThan(0)
  })
})

describe('runAndCompress', () => {
  it('runs the injected runner and compresses stdout', async () => {
    const fakeRunner = vi.fn().mockResolvedValue({ stdout: 'output line\n'.repeat(20), exitCode: 0 })
    const db = makeDb()
    const ccr = new CcrStore(db)
    const result = await runAndCompress(['echo', 'hello'], { runner: fakeRunner, ccr })
    expect(fakeRunner).toHaveBeenCalledWith(['echo', 'hello'])
    expect(result.exitCode).toBe(0)
    expect(result.compressed).toBeDefined()
    expect(result.tokensBefore).toBeGreaterThanOrEqual(0)
  })

  it('propagates non-zero exit code', async () => {
    const fakeRunner = vi.fn().mockResolvedValue({ stdout: 'error output', exitCode: 1 })
    const result = await runAndCompress(['bad-cmd'], { runner: fakeRunner, ccr: null })
    expect(result.exitCode).toBe(1)
  })
})
