/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_72a9987e8fa5 — scoreLoggingCoverage: % de módulos com instrumentação de
 * log. Pura. Módulo coberto se usa createLogger ou chama log./logger.
 */
import { describe, it, expect } from 'vitest'
import { scoreLoggingCoverage } from '../core/harness/logging-coverage-scanner.js'

describe('scoreLoggingCoverage — cobertura de logging (#Q1)', () => {
  it('todos com log → logScore 100', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: "const log = createLogger({});\nlog.info('x');" },
      { path: 'b.ts', content: "logger.warn('y');" },
    ])
    expect(r.logScore).toBe(100)
    expect(r.dark).toEqual([])
  })

  it('metade com log → logScore 50 e dark lista os sem log', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: "log.error('e');" },
      { path: 'b.ts', content: 'export const x = 1;' },
    ])
    expect(r.logScore).toBe(50)
    expect(r.dark).toEqual(['b.ts'])
  })

  it('lista vazia → logScore 100 (nada a cobrir)', () => {
    expect(scoreLoggingCoverage([]).logScore).toBe(100)
  })

  it('arquivos .test. são ignorados', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: "log.info('x');" },
      { path: 'a.test.ts', content: 'expect(1).toBe(1);' },
    ])
    expect(r.total).toBe(1) // só a.ts conta
    expect(r.logScore).toBe(100)
  })

  it('nenhum com log → logScore 0', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: 'export const x = 1;' },
      { path: 'b.ts', content: 'export const y = 2;' },
    ])
    expect(r.logScore).toBe(0)
    expect(r.dark).toHaveLength(2)
  })

  it('reconhece logger.info/error/debug', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: "logger.info('started');" },
      { path: 'b.ts', content: "logger.error('failed');" },
    ])
    expect(r.logScore).toBe(100)
  })

  it('arquivos .spec. são ignorados', () => {
    const r = scoreLoggingCoverage([
      { path: 'a.ts', content: "log.info('x');" },
      { path: 'a.spec.ts', content: 'describe("x", () => {})' },
    ])
    expect(r.total).toBe(1)
    expect(r.logScore).toBe(100)
  })
})
