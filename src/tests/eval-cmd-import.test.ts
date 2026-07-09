/*!
 * Regression test: agf eval must not crash with ts-morph bundling error.
 *
 * AC: eval-cmd module imports cleanly; astCompressCode works with TypeScript code.
 * Root cause: ts-morph bundled into ESM throws "Dynamic require of 'fs' not supported"
 * Fix: add ts-morph + @ts-morph/common to tsup external array.
 */

import { describe, it, expect } from 'vitest'
import { astCompressCode } from '../core/economy/code-ast-compress.js'

describe('eval-cmd: ts-morph integration (regression guard)', () => {
  it('AC1: astCompressCode does not throw on valid TypeScript', () => {
    const code = `
import { join } from 'node:path'
export function buildPath(base: string, sub: string): string {
  return join(base, sub)
}
`
    expect(() => astCompressCode(code)).not.toThrow()
  })

  it('AC2: astCompressCode compresses or returns input unchanged (no crash)', () => {
    const code = `// comment at top
import { readFileSync } from 'node:fs'
export function readJson(p: string): unknown {
  const content = readFileSync(p, 'utf8')
  return JSON.parse(content)
}
`
    const result = astCompressCode(code)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('AC3: eval-cmd module imports without error', async () => {
    await expect(import('../cli/commands/eval-cmd.js')).resolves.toBeDefined()
  })
})
