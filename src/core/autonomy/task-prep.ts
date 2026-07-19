/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Unified task pipeline seams — `prepareTask` / `finalizeTask`.
 *
 * The provider path (`--live`, `live-implement.ts`) and the delegate path
 * (`agf brief` → external agent → `agf submit`) used to compute their token-economy
 * context and record their telemetry in **two forked code paths**. This module is
 * the single source of truth for both ends of the pipeline so the gains connect to
 * the delegate loop with **zero duplication**:
 *
 *   prepareTask ──► execute(seam: provider | delegate) ──► finalizeTask
 *
 * `prepareTask` builds the ranked repo-map (PageRank, ~1k tok), the flow-diluted
 * graph context (Φ hypofrontality), the deterministic reuse decision, and — when a
 * `projectDir` is given — the **memory-inject** (prior project memories surfaced for
 * the task; the safe per-task seam that resolves the deferred risk, never the cached
 * hot-path context-assembler). `finalizeTask` records the union of what each path
 * recorded: episodic outcome + artifact-cache (when edits are present) + learning
 * signal, plus the `artifact_reuse` lever. Every write is best-effort — telemetry
 * never breaks the caller.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { TokenLedger, estimateTokens } from './token-ledger.js'
import { buildRepoMap, type RepoMapSymbol, type RepoMapRelation } from '../context/repo-map.js'
import { applyFlowToCompact, formatFlowContext } from '../context/flow-compact.js'
import { computeTaskSignature } from '../reuse/task-signature.js'
import { resolveReuse, type ReuseDecision } from '../reuse/resolve-reuse.js'
import { recordArtifact } from '../reuse/artifact-cache.js'
import { insertEpisodicOutcome, buildApproachSummary } from '../store/episodic-outcomes-store.js'
import { recordTaskLearning } from '../learning/record-task-learning.js'
import { rankMemoriesByActivation, type MemorySearchResult } from '../memory/memory-reader.js'
import { dedupeByNCD } from '../economy/ncd-dedup.js'
import { neuroForage } from '../economy/neuro-forage.js'
import {
  resolveEconomyLeversConfig,
  isLeverEnabled,
  getLeverParam,
  enableBundle,
  LOSS_SAFE_BUILD_BUNDLE,
  type EconomyLeversConfig,
  type EconomyLeversConfigSource,
} from '../economy/economy-levers-config.js'
import { detectAiFromEnv } from '../output/writer.js'
import { detectActiveCLI } from '../cli-provider/cli-provider.js'
import { depositPheromone, strongestPheromones } from '../economy/pheromone-store.js'
import { recordLeverEvent } from '../economy/economy-lever-ledger.js'
import { runGovernorTick } from '../economy/governor-tick.js'
import { resolveSessionId } from '../session/session-id.js'
import { getCalibratedCharsPerToken } from '../context/zipf-calibration.js'
import { CodeStore } from '../code/code-store.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'task-prep.ts' })

/** Token budget of the repo-map injected into the prompt/brief. */
const REPO_MAP_TOKEN_BUDGET = 1000
/** Max prior memories surfaced for a task when memory-inject is enabled. */
const MEMORY_INJECT_LIMIT = 5
/** Drop memories more than this many nats of activation below the most salient one (≈148× staler at equal frequency). */
const MEMORY_SALIENCE_BAND = 2.5

/** A minimal task handle — id + title is all the seams need to identify a task. */
export interface TaskRef {
  id: string
  title: string
}

export interface PrepareTaskOptions {
  /** Pre-loaded repo symbols (`--live` loads once per session). When absent, loaded on demand. */
  repoSymbols?: RepoMapSymbol[]
  /** Pre-loaded repo relations (paired with {@link repoSymbols}). */
  repoRelations?: RepoMapRelation[]
  /** When given, repo-map / flow input-cuts are recorded as levers. Absent → read-only prep. */
  ledger?: TokenLedger
  /** Project directory enabling the memory-inject (`searchMemories`). Absent → no memory I/O. */
  projectDir?: string
  /** Optional live log sink (CLI prints; TUI appends). Brief path omits it → silent. */
  onLog?: (msg: string) => void
}

export interface TaskPreparation {
  /** Ranked repo-map text (PageRank, budgeted) — undefined when no symbols are indexed. */
  repoMap?: string
  /** Flow-diluted graph context — undefined when flow is disabled (default). */
  flowContext?: string
  /** Deterministic reuse decision (exact / scaffold / none). */
  reuse: ReuseDecision
  /** Task signature (sha256 of canonical fields) — reused by finalize for the artifact cache. */
  signature: string
  /** Prior project memories relevant to the task (empty unless `projectDir` is given). */
  priorMemories: MemorySearchResult[]
  /** Strongest stigmergy trails (files prior successful tasks touched) — empty unless the `stigmergy` lever is on. */
  pheromoneTrails: string[]
}

/**
 * True when a code agent (not a human) is driving agf — the trigger for auto-activating
 * the loss-safe economy bundle. Composes the two detectors so coverage is both CORRECT and
 * BROAD: {@link detectActiveCLI} carries the CONFIRMED live markers for the four primary
 * drivers (Claude=`CLAUDECODE`, Copilot=`COPILOT_CLI`, Codex=`CODEX`, OpenCode=`OPENCODE`),
 * and {@link detectAiFromEnv} adds best-effort breadth for the long tail (Cursor, Aider,
 * Gemini, Windsurf, …). Both read `process.env`, so callers and tests share one env view.
 */
export function isAgentDriver(): boolean {
  return detectActiveCLI() !== null || detectAiFromEnv() !== null
}

/**
 * Resolve the economy levers effective for THIS run: the persisted config, plus the
 * loss-safe build bundle auto-enabled when an agent drives agf and the user has not opted
 * out (`AGF_ECONOMY_AUTO=0`). Pure w.r.t. the persisted setting — a human / non-agent run
 * gets the base config byte-for-byte, so the default-off guarantee holds. This is the single
 * entry point task-prep uses instead of `resolveEconomyLeversConfig`, so every lever read
 * downstream sees the auto-activation consistently.
 */
export function resolveEffectiveLevers(source: EconomyLeversConfigSource): EconomyLeversConfig {
  const base = resolveEconomyLeversConfig(source)
  if (process.env.AGF_ECONOMY_AUTO === '0') return base
  return isAgentDriver() ? enableBundle(base, LOSS_SAFE_BUILD_BUNDLE) : base
}

/**
 * Build the shared per-task context (repo-map + flow + reuse + optional memory-inject).
 * Used identically by the provider path and the delegate brief — the single prep authority.
 */
export async function prepareTask(
  store: SqliteStore,
  node: TaskRef,
  opts: PrepareTaskOptions = {},
): Promise<TaskPreparation> {
  const { ledger, onLog } = opts
  const projectId = store.getProject()?.id

  // ── Repo-map (input cut): ranked symbols within budget, focused on the task. ──
  let repoSymbols = opts.repoSymbols
  let repoRelations = opts.repoRelations
  if (!repoSymbols && projectId) {
    const codeStore = new CodeStore(store.getDb())
    repoSymbols = codeStore.getAllSymbols(projectId)
    repoRelations = codeStore.getAllRelations(projectId)
  }
  // Heat-kernel ranking is opt-in (`heat_kernel` lever); default PageRank. The loss-safe
  // bundle auto-activates here when an agent drives (byte-identical for humans).
  const leversForRepo = resolveEffectiveLevers(store)

  // ── Budget governor (opt-in): o termostato ambiental — lê o burn-rate da sessão
  // no ledger e regula os knobs das levers SEM decisão do driver (a formiga só
  // caminha; o ambiente regula). OFF/sem alvo → null, byte-idêntico. ──
  if (isLeverEnabled(leversForRepo, 'budget_governor')) {
    try {
      const tick = runGovernorTick(store, { sessionId: resolveSessionId(store, { now: Date.now() }) })
      if (tick && tick.actuations.length > 0) {
        onLog?.(
          `  [governor] ${tick.actuations.length} knob(s) regulado(s) — burn ${Math.round(tick.measuredRate)}/min vs alvo ${tick.targetRate}/min`,
        )
      }
    } catch (err) {
      log.debug('task-prep:governor:skipped', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  const repoRanker = isLeverEnabled(leversForRepo, 'heat_kernel') ? 'heat_kernel' : 'pagerank'
  // Zipf-calibrated chars/token budget is opt-in (`zipf_estimate` lever); default chars/4.
  const charsPerToken = isLeverEnabled(leversForRepo, 'zipf_estimate') ? getCalibratedCharsPerToken(store) : undefined

  // ── Stigmergy (opt-in): read pheromone trails before repo-map so symbols from
  // files that prior successful tasks touched get a ranking boost (Dorigo ACO). ──
  let pheromoneTrails: string[] = []
  let pheromoneBoost: Map<string, number> | undefined
  const stigmergyOn = projectId !== undefined && isLeverEnabled(leversForRepo, 'stigmergy')
  if (stigmergyOn) {
    try {
      const trails = strongestPheromones(store.getDb(), projectId!)
      pheromoneTrails = trails.map((t) => t.key)
      if (trails.length > 0) {
        pheromoneBoost = new Map(
          trails.map((t) => {
            const filePath = t.key.startsWith('file:') ? t.key.slice(5) : t.key
            return [filePath, 1 + t.strength]
          }),
        )
      }
    } catch (err) {
      log.debug('task-prep:pheromone-boost:skipped', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  const repoMapResult =
    repoSymbols && repoSymbols.length > 0
      ? buildRepoMap(
          { symbols: repoSymbols, relations: repoRelations ?? [] },
          {
            tokenBudget: REPO_MAP_TOKEN_BUDGET,
            focus: node.title,
            ranker: repoRanker,
            forageStop: isLeverEnabled(leversForRepo, 'forage_stop'),
            ...(charsPerToken !== undefined ? { charsPerToken } : {}),
            ...(pheromoneBoost !== undefined ? { pheromoneBoost } : {}),
          },
        )
      : undefined
  const repoMap = repoMapResult?.text || undefined
  if (ledger && repoMapResult && repoMapResult.fullEstimated > repoMapResult.tokensEstimated) {
    // repo_map lever counts the cut from ranking+budget; the forage_stop slice is
    // attributed separately below so each lever's contribution is measured honestly.
    ledger.record(node.id, {
      model: '(repo-map)',
      tokensIn: 0,
      tokensOut: 0,
      savedTokens: repoMapResult.fullEstimated - repoMapResult.tokensEstimated - repoMapResult.forageSavedTokens,
      lever: 'repo_map',
    })
  }
  if (ledger && repoMapResult && repoMapResult.forageSavedTokens > 0) {
    ledger.record(node.id, {
      model: '(forage-stop)',
      tokensIn: 0,
      tokensOut: 0,
      savedTokens: repoMapResult.forageSavedTokens,
      lever: 'forage_stop',
    })
  }

  // ── Flow (λ_flow input cut): graph context diluted by hypofrontality. ──
  // Null when flow is disabled (default) → legacy behaviour intact.
  let flowContext: string | undefined
  const flow = applyFlowToCompact(store, node.id)
  if (flow) {
    flowContext = formatFlowContext(flow)
    onLog?.(
      `  [flow] Φ=${flow.flow.phi.toFixed(2)} λ=${flow.flow.lambda.toFixed(2)} podados=${flow.flow.prunedCount} pinados=${flow.flow.pinnedCount} → ${flow.flow.tokensSaved} tok economizados`,
    )
    if (ledger && flow.flow.tokensSaved > 0) {
      ledger.record(node.id, {
        model: '(flow)',
        tokensIn: 0,
        tokensOut: 0,
        savedTokens: flow.flow.tokensSaved,
        lever: 'flow',
      })
    }
  }

  // ── Deterministic reuse (Épico R): signature → exact/scaffold from the cache. ──
  const fullNode = store.getNodeById?.(node.id)
  const signature = computeTaskSignature({
    title: node.title,
    acceptanceCriteria: fullNode?.acceptanceCriteria,
    type: fullNode?.type,
    tags: fullNode?.tags,
  })
  const reuse = resolveReuse(store.getDb(), signature)
  if (reuse.kind !== 'none') {
    onLog?.(
      `  [reuse] ${reuse.kind} (sig ${signature.slice(0, 8)}…) → ${reuse.kind === 'exact' ? '0 tok se verde' : 'scaffold no prompt'}`,
    )
  }

  // ── Memory-inject (opt-in via projectDir): prior project memories for the task. ──
  // Per-task, fresh read — NOT the cached context-assembler hot path. Best-effort.
  let priorMemories: MemorySearchResult[] = []
  if (opts.projectDir) {
    try {
      // ACT-R salience: rank by base-level activation (recency × frequency) and drop
      // stale/rare memories (activation < 0) → fewer, higher-value memory tokens.
      const ranked = await rankMemoriesByActivation(opts.projectDir, node.title, {
        limit: MEMORY_INJECT_LIMIT,
        nowMs: Date.now(),
        relativeThreshold: MEMORY_SALIENCE_BAND,
      })
      priorMemories = ranked.kept
      if (ledger && ranked.droppedTokens > 0) {
        ledger.record(node.id, {
          model: '(memory-salience)',
          tokensIn: 0,
          tokensOut: 0,
          savedTokens: ranked.droppedTokens,
          lever: 'memory_salience',
        })
      }

      const leversCfg = resolveEffectiveLevers(store)

      // NCD dedup (opt-in): drop near-duplicate injected memories (gzip NCD) — fewer tokens.
      if (priorMemories.length > 1 && isLeverEnabled(leversCfg, 'ncd_dedup')) {
        const dd = dedupeByNCD(priorMemories.map((m) => m.snippet))
        if (dd.droppedIndices.length > 0) {
          const droppedSet = new Set(dd.droppedIndices)
          const savedTokens = dd.droppedIndices.reduce((s, i) => s + estimateTokens(priorMemories[i].snippet), 0)
          priorMemories = priorMemories.filter((_, i) => !droppedSet.has(i))
          if (ledger && savedTokens > 0) {
            ledger.record(node.id, {
              model: '(ncd-dedup)',
              tokensIn: 0,
              tokensOut: 0,
              savedTokens,
              lever: 'ncd_dedup',
            })
          }
        }
      }

      // NeuroForage forage-stop (opt-in): composes heat-kernel relevance weights
      // (when the `heat_kernel` lever is on) + MVT (Charnov) + epsilon-greedy
      // exploration. When no heat-kernel graph is available, falls back to pure MVT.
      // Memories are activation-ranked desc, so the dropped tail is the least valuable.
      if (priorMemories.length > 1 && isLeverEnabled(leversCfg, 'forage_stop')) {
        const minScore = Math.min(...priorMemories.map((m) => m.score))
        const items = priorMemories.map((m) => ({
          gain: m.score - minScore + 1,
          tokens: Math.max(1, estimateTokens(m.snippet)),
        }))
        const sel = neuroForage(items, {
          minItems: getLeverParam(leversCfg, 'forage_stop', 'minItems', 1),
          epsilon: getLeverParam(
            leversCfg,
            'forage_stop',
            'epsilon',
            isLeverEnabled(leversCfg, 'info_bottleneck') ? 0.1 : 0,
          ),
        })
        if (sel.takenIndices.length < priorMemories.length) {
          const savedTokens = priorMemories
            .filter((_, i) => !sel.takenIndices.includes(i))
            .reduce((s, m) => s + estimateTokens(m.snippet), 0)
          priorMemories = sel.takenIndices.map((i) => priorMemories[i])
          if (ledger && savedTokens > 0) {
            ledger.record(node.id, {
              model: '(forage-stop)',
              tokensIn: 0,
              tokensOut: 0,
              savedTokens,
              lever: 'forage_stop',
            })
          }
        }
        if (sel.epsilonSwap) {
          onLog?.(`  [forage] epsilon-greedy swap: +${sel.epsilonSwap}`)
        }
      }
    } catch (err) {
      log.debug('task-prep:memory-inject:skipped', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Stigmergy logging & lever event — trails already read above for repo-map
  // boost; here we just log and record the lever event. ──
  if (pheromoneTrails.length > 0) {
    try {
      onLog?.(`  [stigmergy] ${pheromoneTrails.length} trilha(s) seguida(s): ${pheromoneTrails.slice(0, 3).join(', ')}`)
      recordLeverEvent(store.getDb(), {
        surface: 'context',
        sessionId: `prep-${Date.now()}`,
        nodeId: node.id,
        lever: 'stigmergy',
        tokensBefore: 0,
        tokensAfter: 0,
        saved: 0,
        accepted: true,
        gateOutcome: 'accepted',
      })
    } catch {
      // logging never breaks the prep
    }
  }

  return { repoMap, flowContext, reuse, signature, priorMemories, pheromoneTrails }
}

export interface FinalizeTaskInput {
  /** Did the task end green? Drives episodic outcome + learning ac-passed. */
  success: boolean
  /** Surgical edits that went green — seeds the artifact cache (provider path). Absent → no artifact. */
  appliedEdits?: Array<{ path: string; oldString: string; newString: string }>
  /** Files touched — used to build the approach summary when none is given. */
  touchedFiles?: string[]
  /** Task signature from {@link prepareTask} — the artifact-cache key. */
  signature: string
  /** Model id that produced the result (for the artifact row / lever). */
  model?: string
  /** Reuse outcome — `exact` records the `artifact_reuse` saving lever when a ledger is present. */
  reused?: 'exact' | 'scaffold'
  /** Override the approach summary digest (delegate path passes its own). */
  approachSummary?: string
  /** Acceptance-criteria passed — defaults to {@link success} when omitted. */
  acPassed?: boolean
}

export interface FinalizeTaskOptions {
  /** When present, records the `artifact_reuse` saving lever on an exact reuse. */
  ledger?: TokenLedger
  /** Routing identity for the learning record (defaults to `local`). */
  agentId?: string
}

/**
 * Record the union of task-completion telemetry: episodic outcome + artifact cache
 * (when edits are present) + learning signal, plus the `artifact_reuse` lever. The
 * single finalize authority for both execution paths. Every write is best-effort —
 * telemetry never breaks the caller (mirrors the legacy inline try/catch blocks).
 */
export function finalizeTask(
  store: SqliteStore,
  node: TaskRef,
  input: FinalizeTaskInput,
  opts: FinalizeTaskOptions = {},
): void {
  const touched = input.touchedFiles ?? input.appliedEdits?.map((e) => e.path) ?? []
  const approachSummary = input.approachSummary ?? buildApproachSummary(touched, [])
  const taskType = store.getNodeById?.(node.id)?.type ?? ''

  // Feeds Φ(t): records the outcome for the next flow computation.
  try {
    insertEpisodicOutcome(store.getDb(), {
      id: generateId('epi'),
      nodeId: node.id,
      taskType,
      tags: '',
      approachSummary,
      outcome: input.success ? 'success' : 'failure',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: Date.now(),
    })
  } catch {
    // telemetry never breaks the finalize
  }

  // Artifact cache (Épico R): only seedable when the edit payloads are present.
  if (input.success && input.appliedEdits && input.appliedEdits.length > 0) {
    try {
      recordArtifact(store.getDb(), {
        id: generateId('art'),
        signature: input.signature,
        nodeId: node.id,
        appliedEdits: input.appliedEdits,
        approachSummary,
        model: input.model,
        outcome: 'success',
        createdAt: Date.now(),
      })
    } catch {
      // cache never breaks the finalize
    }
  }

  // Learning signal (feeds `agf learning route/stats`).
  try {
    recordTaskLearning(store, {
      nodeId: node.id,
      acPassed: input.acPassed ?? input.success,
      ...(opts.agentId !== undefined ? { agentId: opts.agentId } : {}),
    })
  } catch {
    // telemetry never breaks the finalize
  }

  // Exact-reuse saving lever: the model output that was NOT generated.
  if (input.reused === 'exact' && opts.ledger && input.appliedEdits && input.appliedEdits.length > 0) {
    opts.ledger.record(node.id, {
      model: input.model ?? '(reuse)',
      tokensIn: 0,
      tokensOut: 0,
      savedTokens: estimateTokens(JSON.stringify(input.appliedEdits)),
      lever: 'artifact_reuse',
    })
  }

  // Stigmergy deposit (opt-in): a green task lays a decaying trail on the files it
  // touched, so the next task can follow the strongest trails (Dorigo ACO).
  if (input.success && touched.length > 0 && isLeverEnabled(resolveEconomyLeversConfig(store), 'stigmergy')) {
    const projectId = store.getProject()?.id
    if (projectId) {
      try {
        for (const path of touched) depositPheromone(store.getDb(), projectId, `file:${path}`)
      } catch {
        // pheromone deposit never breaks the finalize
      }
    }
  }
}
