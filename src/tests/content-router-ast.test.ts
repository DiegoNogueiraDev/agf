/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { routeContent } from '../core/economy/content-router.js'

// A large TS blob with fat function bodies — AST body-dropping should win here.
function bigCode(): string {
  const fns: string[] = []
  for (let i = 0; i < 20; i++) {
    fns.push(
      `export function handler${i}(input: string): number {\n` +
        `  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)\n` +
        `  let total = 0\n` +
        `  for (const p of parts) { total += p.length * ${i + 1} }\n` +
        `  console.log('processed ${i}', total, parts)\n` +
        `  return total\n` +
        `}`,
    )
  }
  return fns.join('\n\n')
}

describe('content-router AST compression gate (T4.2)', () => {
  // AC: GIVEN a large code blob WHEN routed THEN AST compression applies (bodies dropped, smaller)
  it('applies AST body-dropping to large code and shrinks it', () => {
    const code = bigCode()
    const res = routeContent(code)
    expect(res.contentType).toBe('code')
    expect(res.compressor).toBe('ast_compress')
    expect(res.output.length).toBeLessThan(code.length)
    expect(res.output).toContain('/* … */') // bodies replaced by the placeholder
    expect(res.output).toContain('handler0') // signatures preserved
  })

  // AC: GIVEN a small code blob WHEN routed THEN behavior is unchanged (no AST path)
  it('leaves small code on the lossless path (no code-ast compressor)', () => {
    const res = routeContent('const x = 1')
    expect(res.compressor).not.toBe('ast_compress')
  })

  it('auto-reverts (does not pick code-ast) when AST yields no gain', () => {
    // Bodyless declarations: AST has nothing to drop → no gain → not selected.
    const decls = Array.from({ length: 40 }, (_, i) => `export const K${i}: number = ${i}`).join('\n')
    const res = routeContent(decls)
    expect(res.compressor).not.toBe('ast_compress')
  })
})
