/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_ecef1100677c — collectSrcFiles: coleta arquivos de src/ para os scanners
 * de qualidade usados pelo /quality da TUI.
 */
import { describe, it, expect } from 'vitest'
import { collectSrcFiles } from '../core/harness/collect-src.js'

describe('collectSrcFiles (#T2)', () => {
  it('coleta os .ts do próprio src/ (inclui flow-index)', () => {
    const files = collectSrcFiles(process.cwd())
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.path.includes('flow-index'))).toBe(true)
    expect(files.every((f) => typeof f.content === 'string')).toBe(true)
  })

  it('dir sem src → lista vazia (não lança)', () => {
    expect(collectSrcFiles('/caminho/inexistente/xyz')).toEqual([])
  })
})
