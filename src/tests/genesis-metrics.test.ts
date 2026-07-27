/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  recordGenesisRun,
  readGenesisRuns,
  genesisMetricsSection,
  MANUAL_BASELINE_ROUND_TRIPS,
} from '../core/orchestrator/genesis-metrics.js'

// node_64d196c10406 — time-to-first-brief: sem número o ganho de time-to-market
// é alegação (regra 16). Cada run do genesis grava {elapsedMs, tokensSpent,
// roundTrips=1} numa linha PRÓPRIA (histórico, nunca sobrescreve) e o agf
// metrics expõe a seção junto do baseline manual (≥5 comandos equivalentes).

function makeDb(): Database.Database {
  return new Database(':memory:')
}

describe('genesis-metrics — time-to-first-brief + round-trips', () => {
  it('AC1: um run gravado aparece na seção com elapsedMs, tokensSpent e roundTrips=1', () => {
    const db = makeDb()
    recordGenesisRun(db, { elapsedMs: 4200, tokensSpent: 1234 })

    const section = genesisMetricsSection(db)

    expect(section).not.toBeNull()
    expect(section!.runs).toHaveLength(1)
    expect(section!.runs[0]).toMatchObject({ elapsedMs: 4200, tokensSpent: 1234, roundTrips: 1 })
    db.close()
  })

  it('AC2: genesis registra 1 round-trip contra baseline manual ≥5 documentado na métrica', () => {
    const db = makeDb()
    recordGenesisRun(db, { elapsedMs: 100, tokensSpent: 0 })

    const section = genesisMetricsSection(db)!

    expect(MANUAL_BASELINE_ROUND_TRIPS).toBeGreaterThanOrEqual(5)
    expect(section.baselineRoundTrips).toBe(MANUAL_BASELINE_ROUND_TRIPS)
    expect(section.runs[0].roundTrips).toBe(1)
    expect(section.runs[0].roundTrips).toBeLessThan(section.baselineRoundTrips)
    db.close()
  })

  it('AC3: duas execuções ⇒ duas linhas próprias, sem sobrescrever histórico', () => {
    const db = makeDb()
    recordGenesisRun(db, { elapsedMs: 100, tokensSpent: 10 })
    recordGenesisRun(db, { elapsedMs: 200, tokensSpent: 20 })

    const runs = readGenesisRuns(db)

    expect(runs).toHaveLength(2)
    expect(runs.map((r) => r.elapsedMs).sort((a, b) => a - b)).toEqual([100, 200])
    db.close()
  })

  it('sem runs ⇒ seção null (metrics não inventa seção vazia)', () => {
    const db = makeDb()
    expect(genesisMetricsSection(db)).toBeNull()
    db.close()
  })

  it('db sem a tabela é auto-curado na primeira escrita (self-heal, sem migração)', () => {
    const db = makeDb()
    expect(() => recordGenesisRun(db, { elapsedMs: 1, tokensSpent: 0 })).not.toThrow()
    expect(readGenesisRuns(db)).toHaveLength(1)
    db.close()
  })
})
