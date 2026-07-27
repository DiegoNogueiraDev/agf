/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Suite evals/suite/economy/ + strict loader (node_8aa9c5027b13). O `economy:gate`
 * (eval --suite economy --gate) referenciava um dir inexistente ⇒ NO_SCENARIOS e o
 * gate nunca rodava. Aqui: (AC1) a suite REAL no disco carrega ≥1 cenário; (AC3) um
 * cenário mal-formado, em modo strict, FALHA com erro acionável NOMEANDO o arquivo —
 * hoje `loadSuite` engole malformados (log.warn+continue), um silent-failure. O modo
 * strict é opt-in: o default segue byte-idêntico (skip+warn), o gate liga strict.
 * Zero mock: fixtures são arquivos reais (o da suite versionado; o malformado num
 * tmpdir real via mkdtempSync).
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSuite } from '../core/evals/scenario-runner.js'

const ECONOMY_SUITE_DIR = join(process.cwd(), 'evals', 'suite', 'economy')

function tmpSuiteWith(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-economy-suite-'))
  const scenarioDir = join(dir, name)
  mkdirSync(scenarioDir, { recursive: true })
  writeFileSync(join(scenarioDir, 'scenario.json'), content, 'utf8')
  return dir
}

describe('economy suite + strict loader (node_8aa9c5027b13)', () => {
  // ─── AC1: a suite economy real carrega ≥1 cenário (gate deixa de NO_SCENARIOS) ─
  it('AC1: loadSuite(evals/suite/economy) devolve ≥1 cenário com prd', () => {
    const scenarios = loadSuite(ECONOMY_SUITE_DIR)
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    for (const s of scenarios) {
      expect(s.prd.length).toBeGreaterThan(0)
      expect(s.id.length).toBeGreaterThan(0)
    }
  })

  // ─── AC3: cenário mal-formado em strict ⇒ erro acionável nomeando o arquivo ───
  it('AC3: scenario.json mal-formado em modo strict lança erro nomeando o arquivo', () => {
    const dir = tmpSuiteWith('bad-json', '{ "id": "x", NOT valid json')
    expect(() => loadSuite(dir, undefined, { strict: true })).toThrow(/scenario\.json/)
    expect(() => loadSuite(dir, undefined, { strict: true })).toThrow(/bad-json/)
  })

  // ─── backward-compat: default (não-strict) engole o malformado, sem throw ─────
  it('default (não-strict) mantém o comportamento de hoje: skip+warn, sem throw', () => {
    const dir = tmpSuiteWith('bad-json', '{ invalid')
    expect(loadSuite(dir)).toEqual([])
    expect(loadSuite(dir, undefined, {})).toEqual([])
  })
})
