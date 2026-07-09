/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_dbc4b33ff480 — renderEditDiff: render +/- por arquivo das edições
 * aplicadas pelo agente. Inspirado no diff_render do Codex CLI.
 */
import { describe, it, expect } from 'vitest'
import { renderEditDiff, renderPlanDiff } from '../tui/diff-render.js'
import { diffLineColor } from '../tui/diff-view.js'

describe('renderEditDiff — +/- por linha (#F2)', () => {
  it("edit simples: header com path + linha '-' (old) + linha '+' (new)", () => {
    const lines = renderEditDiff({ path: 'src/sum.ts', oldString: 'a - b', newString: 'a + b' })
    expect(lines.some((l) => l.includes('src/sum.ts'))).toBe(true)
    expect(lines).toContain('- a - b')
    expect(lines).toContain('+ a + b')
  })

  it("criação (oldString vazio) → só linhas '+', nenhuma '-'", () => {
    const lines = renderEditDiff({ path: 'novo.ts', oldString: '', newString: 'export const x = 1;' })
    expect(lines.some((l) => l.startsWith('- '))).toBe(false)
    expect(lines).toContain('+ export const x = 1;')
  })

  it("newString multilinha → uma entrada '+' por linha", () => {
    const lines = renderEditDiff({ path: 'm.ts', oldString: '', newString: 'linha1\nlinha2\nlinha3' })
    expect(lines).toContain('+ linha1')
    expect(lines).toContain('+ linha2')
    expect(lines).toContain('+ linha3')
  })

  it("oldString multilinha → uma entrada '-' por linha", () => {
    const lines = renderEditDiff({ path: 'm.ts', oldString: 'old1\nold2', newString: 'new1' })
    expect(lines).toContain('- old1')
    expect(lines).toContain('- old2')
    expect(lines).toContain('+ new1')
  })
})

describe('renderPlanDiff — concatena edits', () => {
  it('renderiza múltiplos edits com seus headers', () => {
    const out = renderPlanDiff([
      { path: 'a.ts', oldString: 'x', newString: 'y' },
      { path: 'b.ts', oldString: '', newString: 'z' },
    ])
    expect(out.some((l) => l.includes('a.ts'))).toBe(true)
    expect(out.some((l) => l.includes('b.ts'))).toBe(true)
    expect(out).toContain('- x')
    expect(out).toContain('+ z')
  })

  it('lista vazia → sem linhas', () => {
    expect(renderPlanDiff([])).toEqual([])
  })
})

describe('diffLineColor — cor por prefixo', () => {
  it("'+' → green, '-' → red, header → undefined", () => {
    expect(diffLineColor('+ added')).toBe('green')
    expect(diffLineColor('- removed')).toBe('red')
    expect(diffLineColor('── path ──')).toBeUndefined()
  })
})
