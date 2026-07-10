/*!
 * node_de0fcbb6c435 (B31) — saveNamedLoop throws a TYPED error on name conflict
 * (raw `throw new Error` → McpGraphError, so the errors-dimension scanner stops
 * counting it as a raw_throw site).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveNamedLoop } from '../core/autonomy/named-loops.js'
import { McpGraphError } from '../core/utils/errors.js'

let dir: string
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('saveNamedLoop typed-error on conflict', () => {
  it('second save of the same name without --force throws McpGraphError', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-named-loops-'))
    const def = { goal: 'g', rubric: 'r', maxIterations: 1 } as Parameters<typeof saveNamedLoop>[2]

    saveNamedLoop(dir, 'dup', def)
    expect(() => saveNamedLoop(dir, 'dup', def)).toThrow(McpGraphError)
  })

  it('overwrite with force does not throw', () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-named-loops-'))
    const def = { goal: 'g', rubric: 'r', maxIterations: 1 } as Parameters<typeof saveNamedLoop>[2]

    saveNamedLoop(dir, 'dup', def)
    expect(() => saveNamedLoop(dir, 'dup', def, { force: true })).not.toThrow()
  })
})
