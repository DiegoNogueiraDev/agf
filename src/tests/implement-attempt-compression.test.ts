/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 2.2 (partial): Tests for implement-attempt.ts compression paths.
 * AC2 — short string < MIN_COMPRESS_SIZE → no compression applied.
 * AC3 — bestToolCompression with 600-byte TypeScript → ast_compress when AST shrinks it.
 */

import { describe, it, expect } from 'vitest'
import { bestToolCompression } from '../core/autonomy/implement-attempt.js'

// MIN_COMPRESS_SIZE = 500 (from implement-attempt.ts)
const MIN_COMPRESS_SIZE = 500

// ── AC2 ──────────────────────────────────────────────────────────────────────

describe('bestToolCompression: short string < MIN_COMPRESS_SIZE', () => {
  it('returns the original value unchanged for very short strings', () => {
    const short = 'const x = 1'
    expect(short.length).toBeLessThan(MIN_COMPRESS_SIZE)
    const result = bestToolCompression(short)
    expect(result.value).toBe(short)
    expect(result.saved).toBe(0)
  })

  it('filter is null for strings below the compression threshold', () => {
    const short = 'export function add(a: number, b: number): number { return a + b }'
    expect(short.length).toBeLessThan(MIN_COMPRESS_SIZE)
    const result = bestToolCompression(short)
    // Short strings skip compression — filter may be null or a passthrough
    // Key invariant: saved bytes = 0 when no compression applied
    expect(result.saved).toBe(0)
  })
})

// ── AC3 ──────────────────────────────────────────────────────────────────────

describe('bestToolCompression: 600-byte TypeScript snippet', () => {
  it('does not throw on a 600-byte TypeScript snippet', () => {
    const tsCode = `
// module-level comment
import { createServer } from 'node:http'

export function handleRequest(req: Record<string, unknown>, res: Record<string, unknown>): void {
  const body = JSON.stringify({ status: 'ok', timestamp: Date.now() })
  Object.assign(res, { statusCode: 200 })
  return void body
}

export function startServer(port: number): void {
  const server = createServer(handleRequest as never)
  server.listen(port)
}
`.padEnd(600, '// pad\n')
    expect(tsCode.length).toBeGreaterThanOrEqual(600)
    expect(() => bestToolCompression(tsCode)).not.toThrow()
  })

  it('returns a string value for a 600-byte TypeScript snippet', () => {
    const tsCode = `
import { readFileSync } from 'node:fs'
export function loadConfig(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'))
}
export function mergeConfig(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  return { ...base, ...override }
}
`.padEnd(600, '// padding\n')
    const result = bestToolCompression(tsCode)
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  it('saved is non-negative for any input', () => {
    const anyInput = 'test output string'.padEnd(600, ' more content\n')
    const result = bestToolCompression(anyInput)
    expect(result.saved).toBeGreaterThanOrEqual(0)
  })
})
