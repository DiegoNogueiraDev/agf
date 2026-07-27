/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 4.1 — Wire code-ast-compress.ts no content-router
 *
 * AC:
 * 1. blob TS/JS > 2kb → code-ast-compress aplicado com createCodeVerify como guarda
 * 2. exports originais preservados → aceita compressão
 * 3. verificação falha → reverte para original
 * 4. agf compress test mostra filtro ast_compress quando aplicado
 */
import { describe, it, expect } from 'vitest'
import { routeContent } from '../core/economy/content-router.js'

const EXPORTED_FN = `export function add(a: number, b: number): number { return a + b }
export function multiply(a: number, b: number): number { return a * b }
export const PI = 3.14159`

function makeLargeTs(baseCode: string, minBytes: number): string {
  let code = baseCode
  let i = 0
  while (code.length < minBytes) {
    code += `\n// padding comment to exceed 2kb threshold — line ${i++}\nfunction helper${i}(x: number): number { return x * ${i} + Math.sqrt(x) / ${i + 1} }\n`
  }
  return code
}

describe('content-router AST compress wiring (Task 4.1)', () => {
  it('código < 2048 bytes não usa ast_compress (AC#1 — limiar)', () => {
    const smallCode = 'export function hello(): string { return "world"; }\n'
    expect(smallCode.length).toBeLessThan(2048)
    const result = routeContent(smallCode)
    expect(result.compressor).not.toBe('ast_compress')
  })

  it('código TS > 2048 bytes com exports → compressor = ast_compress (AC#1)', () => {
    const largeTs = makeLargeTs(EXPORTED_FN, 2100)
    expect(largeTs.length).toBeGreaterThanOrEqual(2048)
    const result = routeContent(largeTs)
    expect(result.compressor).toBe('ast_compress')
    expect(result.bytesAfter).toBeLessThanOrEqual(result.bytesBefore)
  })

  it('exports preservados após compressão AST (AC#2)', () => {
    const largeTs = makeLargeTs(EXPORTED_FN, 2100)
    const result = routeContent(largeTs)
    // Output must still declare the exported names
    expect(result.output).toContain('add')
    expect(result.output).toContain('multiply')
    expect(result.output).toContain('PI')
  })

  it('código TS grande com helper only (sem exports) não causa erro (AC#3 — revert gracioso)', () => {
    const noExportCode = makeLargeTs(
      'function internal(x: number): number { return x * 2 }\nfunction other(y: string): string { return y.toUpperCase() }\n',
      2200,
    )
    const result = routeContent(noExportCode)
    // Either ast_compress or fallback — should not throw and output should be ≤ input
    expect(result.bytesAfter).toBeLessThanOrEqual(result.bytesBefore)
    expect(result.output).toBeTruthy()
  })
})
