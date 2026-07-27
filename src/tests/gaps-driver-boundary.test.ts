/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do GAP_KIND driver_boundary_missing (F2.T3 — node_e105c8219e21).
 * Lever LIGADA com superfícies driver-facing declaradas mas ZERO linhas de
 * economia nessas superfícies nas últimas N sessões = benefício que não chega
 * ao driver — gap recommended com applyVia. internal-only nunca gera gap.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations/index.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'
import { buildDriverBoundaryProbe, detectDriverBoundary } from '../core/gaps/detect-driver-boundary.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

/** Config-source fake: liga as levers passadas. */
function settingsWith(enabled: string[]): { getProjectSetting(key: string): string | null } {
  const cfg = Object.fromEntries(enabled.map((l) => [l, { enabled: true }]))
  return {
    getProjectSetting(key: string): string | null {
      return key === ECONOMY_LEVERS_SETTING_KEY ? JSON.stringify(cfg) : null
    },
  }
}

function seedRow(
  db: Database.Database,
  lever: string,
  surface: 'hook' | 'context' | 'internal',
  session: string,
): void {
  recordLeverEvent(db, {
    sessionId: session,
    lever,
    tokensBefore: 100,
    tokensAfter: 80,
    saved: 20,
    accepted: true,
    gateOutcome: 'accepted',
    surface,
  })
}

describe('driver_boundary_missing (F2.T3)', () => {
  it('AC1: lever ON com driverSurfaces=[hook] e 0 linhas hook nas ultimas sessoes gera gap nomeando a lever com applyVia', () => {
    // Arrange — mdl_select declara [hook] no registry; ligada, sem linha alguma
    const db = makeDb()
    const probe = buildDriverBoundaryProbe(settingsWith(['mdl_select']), db)

    // Act
    const gaps = detectDriverBoundary(probe)

    // Assert
    expect(gaps.length).toBe(1)
    expect(gaps[0].kind).toBe('driver_boundary_missing')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].evidence).toContain('mdl_select')
    expect(gaps[0].enrichment.applyVia.length).toBeGreaterThanOrEqual(1)
    db.close()
  })

  it('AC2: a mesma lever com >=1 linha surface=hook em sessao recente nao gera gap', () => {
    // Arrange
    const db = makeDb()
    seedRow(db, 'mdl_select', 'hook', 's1')
    const probe = buildDriverBoundaryProbe(settingsWith(['mdl_select']), db)

    // Act
    const gaps = detectDriverBoundary(probe)

    // Assert
    expect(gaps.length).toBe(0)
    db.close()
  })

  it('AC3: lever internal-only (stigmergy) ligada nunca gera gap driver_boundary_missing', () => {
    // Arrange
    const db = makeDb()
    const probe = buildDriverBoundaryProbe(settingsWith(['stigmergy']), db)

    // Act
    const gaps = detectDriverBoundary(probe)

    // Assert
    expect(gaps.length).toBe(0)
    db.close()
  })

  it('lever OFF nao gera gap mesmo sem linhas', () => {
    const db = makeDb()
    const probe = buildDriverBoundaryProbe(settingsWith([]), db)
    expect(detectDriverBoundary(probe).length).toBe(0)
    db.close()
  })

  it('linha driver-facing fora da janela das ultimas 5 sessoes NAO conta (gap volta a disparar)', () => {
    // Arrange — 1 linha hook antiga + 6 sessoes mais novas de outra lever empurram a janela
    const db = makeDb()
    db.prepare(
      `INSERT INTO economy_lever_ledger
        (id, ts, session_id, node_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome, score, baseline_method, surface)
       VALUES ('old1', 1, 's-old', NULL, 'mdl_select', 100, 80, 20, 1, 'accepted', NULL, NULL, 'hook')`,
    ).run()
    for (let i = 0; i < 6; i += 1) seedRow(db, 'heat_kernel', 'context', `s-new-${i}`)
    const probe = buildDriverBoundaryProbe(settingsWith(['mdl_select']), db, { sessions: 5 })

    // Act
    const gaps = detectDriverBoundary(probe)

    // Assert — a linha hook de mdl_select caiu fora da janela de 5 sessoes
    expect(gaps.length).toBe(1)
    expect(gaps[0].evidence).toContain('mdl_select')
    db.close()
  })
})
