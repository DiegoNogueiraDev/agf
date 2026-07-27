/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_0e8bd183ed28 — superfície de providers no ant-swarming: doctor + use,
 * reusando os módulos donos do agf (provider-registry, caste-taxonomy, model-hub)
 * e a MESMA config (project_settings). Fixture: env controlado + banco em memória.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildDoctorReport, useProvider } from '../swarming/providers.js'

describe('ant-swarming providers', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('swarm-providers-test')
  })
  afterEach(() => {
    store.close()
  })

  it('AC1: doctor com OPENROUTER_API_KEY lista openrouter + mapeamento casta→tier→model (4 castas)', () => {
    const report = buildDoctorReport({ OPENROUTER_API_KEY: 'sk-test' })
    expect(report.detected.map((d) => d.id)).toContain('openrouter')
    expect(report.castes).toHaveLength(4)
    const castes = report.castes.map((c) => c.caste)
    expect(castes).toEqual(expect.arrayContaining(['minima', 'pequena', 'media', 'soldado']))
    // cada casta resolve um model concreto (string não-vazia) a partir do tier
    for (const c of report.castes) {
      expect(typeof c.model).toBe('string')
      expect(c.model.length).toBeGreaterThan(0)
    }
  })

  it('AC2: doctor sem nenhuma key → aviso nomeando as env vars (OPENROUTER_API_KEY presente)', () => {
    const report = buildDoctorReport({})
    expect(report.detected.filter((d) => d.envVar).length).toBe(0)
    expect(report.missing).toBeDefined()
    expect(report.missing?.acceptedEnvVars).toContain('OPENROUTER_API_KEY')
    // é diagnóstico, não falha: o builder devolve dados, quem emite decide exit 0
  })

  it('AC3: providers use openrouter persiste no MESMO project_settings que o agf lê', () => {
    useProvider(store, 'openrouter')
    // o agf lê a config pela MESMA chave — fonte única, zero duplicação
    expect(store.getProjectSetting('provider')).toBe('openrouter')
  })
})
