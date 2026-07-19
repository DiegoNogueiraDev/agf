/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harvest pass for the builder loop's NO_TASKS trigger (node_ed1f6c33b7b9).
 *
 * Backlog-empty is a TRIGGER, not the end: this composes the three deterministic
 * harvests that already ship and reports how much drainable work it produced.
 * Wired into {@link runAutopilot} via its `onHarvest` hook (see autopilot-cmd
 * `--harvest`). REUSE — never re-implements the harvests:
 *   - migrate-ac   → folds AC-nodes into parents (cleanup; reduces phantom gaps).
 *   - risk-triage  → SURFACE only (lists open risks; promotion stays human-gated,
 *                    180 risks must NOT auto-promote — that is a policy decision).
 *   - wire-dormant → GENERATES drainable WIRE-tasks; `generated` counts these, so
 *                    the loop re-pulls only when there is genuinely new work.
 *
 * `scanDormant` is injected (DIP) so the pass is testable without touching the FS;
 * the default uses the real {@link buildDormantReport} scanner.
 */
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { migrateAcNodes } from '../../core/importer/migrate-ac.js'
import { triageRisks } from '../../core/risk/risk-triage.js'
import { buildWireTasks, type DormantEntry } from '../../core/harness/wire-dormant-ingest.js'
import { buildDormantReport } from '../../core/harness/dormant-report.js'

/** Outcome of one harvest pass. `generated` (= new WIRE-tasks) drives the loop re-pull. */
export interface HarvestResult {
  /** New drainable WIRE-tasks created (what makes the loop self-feed). */
  generated: number
  /** AC-nodes folded into their parents this pass (cleanup, not drainable). */
  migratedAc: number
  /** Open risks surfaced for human decision (not auto-promoted). */
  openRisks: number
}

/** Cap on WIRE-tasks generated per pass — bounds the wave so 692 dormants don't
 * become 692 tasks at once. The next pass drains the next slice (stable order). */
export const DEFAULT_MAX_GENERATE = 25

/** Injectable seams — default to the real scanner. */
export interface HarvestDeps {
  /** Returns dormant capabilities for `dir`. Injected in tests to avoid FS scans. */
  scanDormant?: (dir: string) => DormantEntry[]
  /** Anti-avalanche cap on WIRE-tasks per pass. Default {@link DEFAULT_MAX_GENERATE}. */
  maxGenerate?: number
}

/** Module paths already wired (dedup source so re-runs are idempotent). */
function existingWiredModules(store: SqliteStore): Set<string> {
  const modules = new Set<string>()
  for (const node of store.toGraphDocument().nodes) {
    const meta = node.metadata as { source?: string; dormantModule?: string } | undefined
    if (meta?.source === 'wire-dormant' && typeof meta.dormantModule === 'string') {
      modules.add(meta.dormantModule)
    }
  }
  return modules
}

/** Run one deterministic harvest pass over the graph. Persists generated WIRE-tasks. */
export function runHarvestPass(store: SqliteStore, dir: string, deps: HarvestDeps = {}): HarvestResult {
  // 1. Collapse AC-nodes into parents — cleanup, reduces phantom gaps.
  const ac = migrateAcNodes(store, { commit: true })
  // 2. Surface open risks for human decision — promotion stays human-gated.
  const risks = triageRisks(store, { dryRun: true })
  // 3. Generate drainable WIRE-tasks from dormant capabilities (deduped).
  //    Stable order (by module path) so the cap drains a deterministic slice and the
  //    next pass picks up where this one stopped — never the same module twice.
  const scan = deps.scanDormant ?? ((d) => buildDormantReport({ rootDir: d, allowlist: [] }).dormant)
  const maxGenerate = deps.maxGenerate ?? DEFAULT_MAX_GENERATE
  const dormant = [...scan(dir)].sort((a, b) => a.module.localeCompare(b.module))
  const wire = buildWireTasks({
    dormant,
    existingModules: existingWiredModules(store),
    allowlist: [],
    dryRun: false,
  })
  const capped = wire.tasks.slice(0, Math.max(0, maxGenerate))
  for (const task of capped) store.insertNode(task)

  return { generated: capped.length, migratedAc: ac.migrated, openRisks: risks.risks.length }
}

/**
 * Build the `onHarvest` hook for {@link runAutopilot}. When the backlog empties,
 * the loop calls this; `generated > 0` makes it re-pull and drain the new wave.
 */
export function buildHarvestHook(store: SqliteStore, dir: string, deps: HarvestDeps = {}): () => { generated: number } {
  return () => ({ generated: runHarvestPass(store, dir, deps).generated })
}

/**
 * Resolve the harvest hook for a loop caller — DEFAULT-ON (deterministic trigger):
 * the loop always fires onHarvest at NO_TASKS unless `--no-harvest` opts out. This is
 * the "who fires it?" rule satisfied in the cli layer (where hooks live) instead of
 * coupling the core autopilot-loop to the hook-runtime/store. Shared by every loop
 * caller (autopilot / build / deliver / TUI) so the default is uniform (DRY).
 */
export function resolveHarvestHook(
  store: SqliteStore,
  dir: string,
  opts: { noHarvest?: boolean },
  deps: HarvestDeps = {},
): (() => { generated: number }) | undefined {
  if (opts.noHarvest) return undefined
  return buildHarvestHook(store, dir, deps)
}
