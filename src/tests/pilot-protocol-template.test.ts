/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 0b.1 — Template Pilot Protocol (≤ 30 linhas)
 *
 * AC:
 * 1. template contém: entry command, loop (next→brief→implementa→submit), exit condition, token targets, quality gate
 * 2. template cabe em ≤ 30 linhas (não verboso)
 * 3. template substitui necessidade de ler CLAUDE.md inteiro para operar o loop
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEMPLATE_PATH = join(process.cwd(), '.agents/skills/_pilot-protocol-template.md')

describe('Pilot Protocol Template (Task 0b.1)', () => {
  it('arquivo de template existe', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true)
  })

  it('cabe em ≤ 30 linhas (AC#2)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim() !== '').length
    expect(lines).toBeLessThanOrEqual(30)
  })

  it('contém entry command (AC#1)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    expect(content).toMatch(/agf start|agf next/)
  })

  it('contém loop next→brief→implementa→submit (AC#1)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    expect(content).toMatch(/next/)
    expect(content).toMatch(/brief/)
    expect(content).toMatch(/submit/)
  })

  it('contém exit condition (AC#1)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    expect(content).toMatch(/exit|done|encerra|sai/)
  })

  it('contém token targets (AC#1)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    expect(content).toMatch(/token/)
  })

  it('contém quality gate (AC#1)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    expect(content).toMatch(/quality|qualidade|gate|DoD|check/)
  })

  it('não requer leitura do CLAUDE.md para entender o loop (AC#3)', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8')
    // Must be self-contained: contain agf commands inline, not just references
    expect(content).toMatch(/agf/)
    // Should NOT depend on reading CLAUDE.md to understand the protocol
    expect(content).not.toMatch(/^leia CLAUDE\.md/im)
  })
})
