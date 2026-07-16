/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * detect-driver-boundary — lever ligada sem efeito no DRIVER (F2.T3, node_e105c8219e21).
 *
 * WHY: wired ≠ firing ≠ firing-no-driver. Uma lever pode estar ON e mesmo assim
 * nunca disparar numa superfície que o agent driver (a LLM condutora — porta de
 * entrada dos tokens) atravessa: o benefício declarado no registry
 * (LEVER_DRIVER_SURFACES) não aparece como linha de economia com aquela surface
 * no economy_lever_ledger. Este detector cruza config × registry × ledger nas
 * últimas N sessões e cobra deterministicamente (regra: enforcement é gatilho,
 * não agente lembrando). Levers internal-only são explícitas — nunca geram gap.
 *
 * DIP: o acesso a config+ledger entra via {@link DriverBoundaryProbe}; o
 * detector é puro sobre o snapshot — testável com :memory: e byte-idêntico
 * quando a superfície (gaps-cmd) não fornece o probe.
 */

import type Database from 'better-sqlite3'
import type { Gap } from './gap-types.js'
import type { DriverSurface } from '../../schemas/driver-surface.schema.js'
import {
  LEVER_DRIVER_SURFACES,
  LEVER_KEYS,
  resolveEconomyLeversConfig,
  isLeverEnabled,
  type EconomyLeversConfigSource,
  type LeverKey,
} from '../economy/economy-levers-config.js'

/** Snapshot por lever LIGADA: superfícies declaradas + linhas driver-facing recentes. */
export interface DriverLeverActivity {
  lever: LeverKey
  /** Superfícies declaradas no registry (fonte única). */
  surfaces: readonly DriverSurface[]
  /** Linhas do ledger nas superfícies declaradas não-internal, janela das últimas N sessões. */
  driverRows: number
}

/** Fornece o snapshot — só levers habilitadas entram. */
export type DriverBoundaryProbe = () => DriverLeverActivity[]

const DEFAULT_SESSION_WINDOW = 5

/**
 * Constrói o probe real sobre config (project_settings) + economy_lever_ledger.
 * Janela = últimas `sessions` sessões distintas por ts (default 5).
 */
export function buildDriverBoundaryProbe(
  source: EconomyLeversConfigSource,
  db: Database.Database,
  opts: { sessions?: number } = {},
): DriverBoundaryProbe {
  const windowSessions = opts.sessions ?? DEFAULT_SESSION_WINDOW
  return () => {
    const cfg = resolveEconomyLeversConfig(source)
    const activities: DriverLeverActivity[] = []
    for (const lever of LEVER_KEYS) {
      if (!isLeverEnabled(cfg, lever)) continue
      const surfaces = LEVER_DRIVER_SURFACES[lever]
      const driverFacing = surfaces.filter((s) => s !== 'internal')
      activities.push({
        lever,
        surfaces,
        driverRows: driverFacing.length === 0 ? 0 : countDriverRows(db, lever, driverFacing, windowSessions),
      })
    }
    return activities
  }
}

/** Linhas da lever nas superfícies declaradas, dentro da janela de sessões. Tabela ausente → 0. */
function countDriverRows(
  db: Database.Database,
  lever: LeverKey,
  surfaces: readonly DriverSurface[],
  windowSessions: number,
): number {
  const placeholders = surfaces.map(() => '?').join(', ')
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM economy_lever_ledger
         WHERE lever = ? AND surface IN (${placeholders})
           AND session_id IN (
             SELECT session_id FROM economy_lever_ledger
             GROUP BY session_id ORDER BY MAX(ts) DESC LIMIT ?
           )`,
      )
      .get(lever, ...surfaces, windowSessions) as { c: number }
    return row.c
  } catch {
    return 0
  }
}

/** Lever ON, superfície driver-facing declarada, zero linhas recentes → gap recommended. */
export function detectDriverBoundary(probe: DriverBoundaryProbe): Gap[] {
  const gaps: Gap[] = []
  for (const a of probe()) {
    const driverFacing = a.surfaces.filter((s) => s !== 'internal')
    if (driverFacing.length === 0) continue
    if (a.driverRows > 0) continue
    gaps.push({
      kind: 'driver_boundary_missing',
      severity: 'recommended',
      evidence: `Lever ${a.lever} está ON com superfície(s) driver-facing declarada(s) [${driverFacing.join(', ')}] mas ZERO linhas de economia nessas superfícies nas últimas sessões — o benefício não está chegando ao driver (wired ≠ firing-no-driver)`,
      enrichment: {
        action: 'annotate',
        instruction: `Verifique o wiring da lever ${a.lever} no(s) ponto(s) de disparo [${driverFacing.join(', ')}] (o registry LEVER_DRIVER_SURFACES declara onde ela DEVE disparar), ou desligue-a até o wire existir — lever ON sem efeito no driver é custo cognitivo sem retorno.`,
        applyVia: [`agf savings --by-surface`, `agf economy off ${a.lever}`],
      },
    })
  }
  return gaps
}
