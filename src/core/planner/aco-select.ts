/*!
 * aco-select — the single selection entry point for `agf next` and `agf start`.
 *
 * WHY: both commands used to call findNextTask directly (deterministic), leaving ACO behind an
 * opt-in flag. This wraps the deterministic sort with the ACO smart-default (see aco-mode.ts):
 * when the mode says so and the pheromone field is informative, pick via the roulette; on a
 * cold field or when the roulette degenerates, fall back to findNextTask. Centralising it here
 * keeps next-cmd and start-cmd DRY and makes the behaviour testable without the CLI layer.
 *
 * Contract: returns a NextTaskResult (node + reason) or null when there is no task at all.
 * reason === 'aco-roulette' iff the pick came from the pheromone roulette.
 */

import type Database from 'better-sqlite3'
import type { GraphDocument } from '../graph/graph-types.js'
import { findNextTask, findUnblockedTasks, declaredFilesOf, type NextTaskResult } from './next-task.js'
import { shouldUseAco, type AcoMode } from './aco-mode.js'
import { pheromoneWeightedSelect, type RNG } from '../colony/pheromone-weighted-select.js'
import { localDecay } from '../economy/mmas-pheromone.js'
import { getAggregatedTagPheromone } from '../economy/pheromone-store.js'
import {
  resolveEconomyLeversConfig,
  getLeverParams,
  type EconomyLeversConfigSource,
} from '../economy/economy-levers-config.js'
import {
  computeSelectionAdvantage,
  recordSelectionAdvantage,
  recordSelectionEpisode,
} from '../economy/selection-quality.js'
import { ALPHA, BETA } from '../economy/aco-params.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { gaussianNoise } from '../economy/ga-operators.js'

export interface SelectParams {
  /** Lazy — only resolved when ACO actually runs (candidates present, mode ≠ off), so an
   *  empty graph never forces the caller to open the DB. */
  getDb: () => Database.Database
  getProjectId: () => string
  mode: AcoMode
  rng: RNG
  pierceContainers?: boolean
  /** Lazy tuned pheromone-importance exponent from the aco_autotune lever (T6c). Resolved
   *  only when ACO actually runs (candidates present), so an empty-graph pull never touches
   *  the lever store. Omitted / undefined → falls back to the static ALPHA (byte-identical). */
  alpha?: () => number | undefined
  /** Lazy Lévy-exploration params from the aco_autotune lever (PRD GRAPH-CLI Leva A+B,
   *  Component A). Omitted / undefined → the roulette never takes the Lévy branch
   *  (byte-identical to today). */
  levy?: () => { pLevy: number; betaLevy: number; kappa: number } | undefined
  /** node_77ee0139ce8d — exclusões teamTask também no caminho plain: tasks com
   *  lease viva de outro agente e candidatas cujos arquivos declarados colidem
   *  com trabalho em voo. Omitidos → byte-idêntico. */
  lockedTaskIds?: Set<string>
  inFlightTouchedFiles?: Set<string>
}

/**
 * Mantegna's algorithm for sampling a Lévy-stable step length (PRD §5.2):
 * `step = u / |v|^(1/β_L)`, with `u ~ N(0, σ_u²)` and `v ~ N(0, 1)`, reusing the
 * project's existing Box-Muller sampler ({@link gaussianNoise}) instead of a new one.
 */
export function levyStep(betaL: number, kappa: number, rand: RNG): number {
  const sigmaU =
    (gammaApprox(1 + betaL) * Math.sin((Math.PI * betaL) / 2)) /
    (gammaApprox((1 + betaL) / 2) * betaL * Math.pow(2, (betaL - 1) / 2))
  const u = gaussianNoise(rand) * Math.pow(sigmaU, 1 / betaL)
  const v = gaussianNoise(rand)
  return kappa * (u / Math.pow(Math.abs(v), 1 / betaL))
}

/** Lanczos approximation of Γ(x) — only used by {@link levyStep}'s σ_u constant. */
function gammaApprox(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaApprox(1 - x))
  const xAdj = x - 1
  let a = c[0]
  const t = xAdj + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (xAdj + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, xAdj + 0.5) * Math.exp(-t) * a
}

/**
 * The tuned pheromone-importance exponent persisted by the GA autotune tick (T6c), or
 * undefined when unset (→ callers fall back to the static ALPHA). Keeps next-cmd/start-cmd DRY.
 */
export function readTunedAcoAlpha(source: EconomyLeversConfigSource): number | undefined {
  return getLeverParams(resolveEconomyLeversConfig(source), 'aco_autotune').alpha
}

export function selectNextTaskSmart(doc: GraphDocument, params: SelectParams): NextTaskResult | null {
  const { getDb, getProjectId, mode, rng, pierceContainers, alpha, levy, lockedTaskIds, inFlightTouchedFiles } = params
  // Opções repassadas a TODO findNextTask deste seletor — a roleta ACO filtra as
  // mesmas exclusões abaixo para nunca sortear uma task vetada pelo teamTask.
  const nextOpts = { pierceContainers, lockedTaskIds, inFlightTouchedFiles }

  if (mode !== 'off') {
    let candidates = findUnblockedTasks(doc)
    if (lockedTaskIds && lockedTaskIds.size > 0) {
      candidates = candidates.filter((c) => !lockedTaskIds.has(c.id))
    }
    if (inFlightTouchedFiles && inFlightTouchedFiles.size > 0) {
      candidates = candidates.filter((c) => !declaredFilesOf(c).some((f) => inFlightTouchedFiles.has(f)))
    }
    if (candidates.length > 0) {
      const db = getDb()
      const projectId = getProjectId()
      // Blocking impact = # of downstream tasks that depend on each candidate (same signal
      // findNextTask uses) — folded into η so the roulette prefers tasks that unblock work.
      const incomingDependsCount = new Map<string, number>()
      for (const edge of doc.edges) {
        if (edge.relationType !== 'depends_on') continue
        incomingDependsCount.set(edge.to, (incomingDependsCount.get(edge.to) ?? 0) + 1)
      }
      const withPheromone = candidates.map((c) => ({
        id: c.id,
        priority: c.priority,
        size: XP_SIZE_ORDER[c.xpSize ?? 'M'] ?? 3,
        pheromone: getAggregatedTagPheromone(db, projectId, c.tags ?? []),
        blockingImpact: incomingDependsCount.get(c.id) ?? 0,
        acCount: c.acceptanceCriteria?.length ?? 0,
      }))

      // Decide the pick: pheromone roulette when the field is informative, else the
      // deterministic sort. EITHER way we record a selection-episode below (target = the
      // actual pick) so the GA has data even on a cold field — the self-priming the
      // smart-default needs (regra 16), not just on roulette picks.
      let picked: NextTaskResult | null = null
      let acoChosenId: string | undefined
      const levyParams = levy?.()
      const useAco = shouldUseAco(
        mode,
        withPheromone.map((c) => c.pheromone),
      )
      if (useAco && levyParams && rng() < levyParams.pLevy) {
        // Component A (PRD GRAPH-CLI Leva A+B): exploratory long jump instead of the
        // roulette pick. No spatial notion in a task backlog — the ordered candidate
        // list stands in for "distance" (documented limitation, see node_658fa534bd65).
        const step = levyStep(levyParams.betaLevy, levyParams.kappa, rng)
        const h = Math.min(withPheromone.length - 1, Math.max(0, 1 + Math.floor(Math.abs(step) * levyParams.kappa)))
        const chosen = withPheromone[h]
        const node = candidates.find((c) => c.id === chosen.id)!
        acoChosenId = chosen.id
        picked = { node, reason: 'levy-jump' }
      } else if (useAco) {
        const chosen = pheromoneWeightedSelect(withPheromone, { alpha: alpha?.() ?? ALPHA, beta: BETA }, rng)
        if (chosen) {
          const node = candidates.find((c) => c.id === chosen.id)!
          acoChosenId = chosen.id
          // ACS local decay: nudge the just-picked trail(s) toward τ_min so the colony keeps
          // exploring alternatives. Best-effort — a decay failure must never break the pull.
          try {
            for (const tag of node.tags ?? []) localDecay(db, projectId, tag)
          } catch {
            /* local decay never breaks selection */
          }
          picked = { node, reason: 'aco-roulette' }
        }
      }
      if (picked === null) picked = findNextTask(doc, nextOpts) // cold/degenerate field

      // Record the episode (+ the advantage signal for roulette picks) for any pick whose
      // target is one of the scored candidates. Best-effort — never breaks the pull.
      if (picked !== null && withPheromone.some((c) => c.id === picked!.node.id)) {
        try {
          if (acoChosenId !== undefined) {
            const baselineId = findNextTask(doc, nextOpts)?.node.id
            if (baselineId) {
              recordSelectionAdvantage(db, projectId, computeSelectionAdvantage(acoChosenId, baselineId, withPheromone))
            }
          }
          recordSelectionEpisode(db, projectId, {
            candidates: withPheromone.map((c) => ({
              id: c.id,
              priority: c.priority,
              size: c.size,
              blockingImpact: c.blockingImpact,
              acCount: c.acCount,
              pheromone: c.pheromone,
            })),
            targetId: picked.node.id,
          })
        } catch {
          /* selection-quality recording never breaks selection */
        }
      }
      if (picked !== null) return picked
    }
  }

  return findNextTask(doc, nextOpts)
}
