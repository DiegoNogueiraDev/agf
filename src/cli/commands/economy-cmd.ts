/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `economy` — toggle/list the opt-in bio/math token-economy levers.
 * JSON envelope, `--select`-able: the external agent reads `data.levers` to see
 * each lever's `enabled` flag + cumulative `saved` tokens, and flips them on/off.
 */
import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import { z } from 'zod/v4'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { summarizeByLever, recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'
import {
  resolveEconomyLeversConfig,
  setLeverEnabled,
  setLeverParam,
  isLeverEnabled,
  buildLeverListEntry,
  LEVER_KEYS,
  getLeverBundle,
  LEVER_BUNDLES,
  type LeverKey,
} from '../../core/economy/economy-levers-config.js'
import { allocateKleiber, type BudgetItem } from '../../core/economy/budget-kleiber.js'
import { PheromoneTrail } from '../../core/economy/stigmergy.js'
import { ECONOMY_PIPELINE_ORDER, ECONOMY_STAGE_ENV_FLAGS, isStageEnabled } from '../../core/economy/economy-pipeline.js'
import {
  EconomyTierSchema,
  CacheKeySchema,
  CacheEntrySchema,
  TierDistributionSchema,
  EconomyStatsSchema,
  ComplexityClassSchema,
} from '../../core/economy/economy-types.js'
import { createLogger } from '../../core/utils/logger.js'
import { getErrorMessage } from '../../core/utils/errors.js'

/** Registry of economy-types.ts Zod schemas exposed via `agf economy schema`. */
const ECONOMY_SCHEMAS: Record<string, z.ZodType> = {
  'economy-tier': EconomyTierSchema,
  'cache-key': CacheKeySchema,
  'cache-entry': CacheEntrySchema,
  'tier-distribution': TierDistributionSchema,
  'economy-stats': EconomyStatsSchema,
  'complexity-class': ComplexityClassSchema,
}

const log = createLogger({ layer: 'cli', source: 'economy-cmd.ts' })

export interface PheromoneSimDeposit {
  key: string
  amount?: number
  atMs: number
}

export interface PheromoneSimOptions {
  halfLifeMs: number
  epsilon?: number
  deposits: PheromoneSimDeposit[]
  now: number
}

export interface PheromoneSimResult {
  trails: Array<{ key: string; strength: number }>
  strongest: { key: string; strength: number } | null
}

/**
 * Pure core: replay a sequence of `stigmergy` deposits through {@link PheromoneTrail}
 * and report each trail's decayed strength at `now` — an in-process explainer for the
 * `e^{-λt}` evaporation math, independent of the SQLite-backed `pheromone-store.ts`.
 */
export function runEconomyPheromoneSim(opts: PheromoneSimOptions): PheromoneSimResult {
  const trail = new PheromoneTrail({ halfLifeMs: opts.halfLifeMs, epsilon: opts.epsilon })
  const keys: string[] = []
  for (const d of opts.deposits) {
    trail.deposit(d.key, d.amount ?? 1, d.atMs)
    if (!keys.includes(d.key)) keys.push(d.key)
  }
  const trails = keys.map((key) => ({ key, strength: trail.strength(key, opts.now) }))
  return { trails, strongest: trail.strongest(keys, opts.now) }
}

function toggle(lever: string, enabled: boolean, dir: string): void {
  const out = createCliOutput('economy')
  if (!(LEVER_KEYS as readonly string[]).includes(lever)) {
    out.err('UNKNOWN_LEVER', `Unknown lever "${lever}". Known: ${LEVER_KEYS.join(', ')}`)
    return
  }
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    setLeverEnabled(store, lever as LeverKey, enabled)
    out.ok({ lever, enabled })
  } finally {
    store.close()
  }
}

/**
 * Toggle a whole named lever bundle at once (e.g. `agf economy preset build`). Reuses
 * {@link setLeverEnabled} per lever, so it merges with any manual toggles and is
 * idempotent. Unknown preset → UNKNOWN_PRESET listing the available bundles.
 */
function applyPreset(name: string, enabled: boolean, dir: string): void {
  const out = createCliOutput('economy')
  const bundle = getLeverBundle(name)
  if (!bundle) {
    out.err('UNKNOWN_PRESET', `Unknown preset "${name}". Known: ${Object.keys(LEVER_BUNDLES).join(', ')}`)
    return
  }
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    for (const lever of bundle) setLeverEnabled(store, lever, enabled)
    out.ok({ preset: name, levers: [...bundle], enabled })
  } finally {
    store.close()
  }
}

/** Builds the `agf economy` CLI command (Commander definition). */
export function economyCommand(): Command {
  log.info('economy command registered')
  const cmd = new Command('economy').description('Toggle/list opt-in bio/math token-economy levers')

  cmd
    .command('list')
    .description('List levers with enabled flag + cumulative saved tokens (JSON)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('economy')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const cfg = resolveEconomyLeversConfig(store)
        const saved = new Map(summarizeByLever(store.getDb()).map((l) => [l.lever, l.totalSaved]))
        const levers = LEVER_KEYS.map((name) =>
          buildLeverListEntry(name, isLeverEnabled(cfg, name), saved.get(name) ?? 0, cfg[name]?.params ?? {}),
        )
        out.ok({ levers }, { count: levers.length })
      } finally {
        store.close()
      }
    })

  cmd
    .command('on <lever>')
    .description('Enable a lever')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((lever: string, opts: { dir: string }) => toggle(lever, true, opts.dir))

  cmd
    .command('off <lever>')
    .description('Disable a lever')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((lever: string, opts: { dir: string }) => toggle(lever, false, opts.dir))

  cmd
    .command('preset <name>')
    .description('Toggle a named lever bundle on/off (e.g. "build" = loss-safe input-side cutters)')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--off', 'Disable the bundle instead of enabling it', false)
    .action((name: string, opts: { dir: string; off: boolean }) => applyPreset(name, !opts.off, opts.dir))

  cmd
    .command('param <lever> <key> <value>')
    .description('Set a numeric parameter on a lever (e.g. "agf economy param forage_stop epsilon 0.2")')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((lever: string, key: string, value: string, opts: { dir: string }) => {
      const out = createCliOutput('economy')
      if (!(LEVER_KEYS as readonly string[]).includes(lever)) {
        out.err('UNKNOWN_LEVER', `Unknown lever "${lever}". Known: ${LEVER_KEYS.join(', ')}`)
        return
      }
      const num = Number.parseFloat(value)
      if (!Number.isFinite(num)) {
        out.err('INVALID_PARAM', `"${value}" is not a finite number`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        setLeverParam(store, lever as LeverKey, key, num)
        out.ok({ lever, param: key, value: num })
      } finally {
        store.close()
      }
    })

  cmd
    .command('allocate-budget')
    .description('Reallocate a token budget across graph nodes by size^0.75 (Kleiber, opt-in `budget_kleiber` lever)')
    .requiredOption('--total <n>', 'Total budget to allocate')
    .option('--limit <n>', 'Max number of sized nodes to allocate across', '50')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { total: string; limit: string; dir: string }) => {
      const out = createCliOutput('economy')
      const total = Number.parseFloat(opts.total)
      if (!Number.isFinite(total) || total < 0) {
        out.err('INVALID_TOTAL', `"${opts.total}" is not a non-negative finite number`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const cfg = resolveEconomyLeversConfig(store)
        if (!isLeverEnabled(cfg, 'budget_kleiber')) {
          out.ok({ enabled: false, allocations: [] })
          return
        }
        const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 50)
        const items: BudgetItem[] = store
          .toGraphDocument()
          .nodes.filter((n) => typeof n.estimateMinutes === 'number' && n.estimateMinutes > 0)
          .slice(0, limit)
          .map((n) => ({ id: n.id, size: n.estimateMinutes as number }))

        const allocations = allocateKleiber(items, total)
        let reclaimed = 0
        if (items.length > 0) {
          const linearTotal = items.reduce((sum, it) => sum + it.size, 0)
          reclaimed = allocations.reduce((sum, a) => {
            const item = items.find((it) => it.id === a.id)!
            const linearShare = linearTotal > 0 ? (total * item.size) / linearTotal : 0
            return sum + Math.max(0, linearShare - a.budget)
          }, 0)
          recordLeverEvent(store.getDb(), {
            sessionId: `economy-allocate-${randomUUID()}`,
            lever: 'budget_kleiber',
            tokensBefore: total,
            tokensAfter: total,
            saved: reclaimed,
            accepted: true,
            gateOutcome: 'accepted',
          })
        }
        out.ok({ enabled: true, total, allocations, reclaimed })
      } finally {
        store.close()
      }
    })

  cmd
    .command('pipeline')
    .description('List economy pipeline stages (Booster→Cache→Tier→Batch→Tiered→...→LLM) with enabled flag')
    .action(() => {
      const out = createCliOutput('economy')
      const stages = ECONOMY_PIPELINE_ORDER.map((stage) => ({
        stage,
        enabled: isStageEnabled(stage),
        envFlag: ECONOMY_STAGE_ENV_FLAGS[stage] ?? null,
      }))
      out.ok({ stages }, { count: stages.length })
    })

  cmd
    .command('schema [name]')
    .description('Expose economy-types.ts Zod schemas as JSON Schema (omit name to list available schemas)')
    .action((name?: string) => {
      const out = createCliOutput('economy')
      if (!name) {
        out.ok({ schemas: Object.keys(ECONOMY_SCHEMAS) })
        return
      }
      const schema = ECONOMY_SCHEMAS[name]
      if (!schema) {
        out.err('UNKNOWN_SCHEMA', `Unknown schema "${name}". Known: ${Object.keys(ECONOMY_SCHEMAS).join(', ')}`)
        return
      }
      out.ok({ name, jsonSchema: z.toJSONSchema(schema) })
    })

  cmd
    .command('pheromone-sim <deposits>')
    .description(
      'Replay stigmergy deposits (JSON array of {key,amount?,atMs}) through the in-process PheromoneTrail and report decayed strengths at --now',
    )
    .option('--half-life <ms>', 'Trail half-life in ms', String(7 * 24 * 60 * 60 * 1000))
    .option('--now <ms>', 'Timestamp to evaluate strengths at', '0')
    .action((deposits: string, opts: { halfLife: string; now: string }) => {
      const out = createCliOutput('economy.pheromone-sim')
      try {
        const parsed: PheromoneSimDeposit[] = JSON.parse(deposits)
        const halfLifeMs = Number.parseFloat(opts.halfLife)
        const now = Number.parseFloat(opts.now)
        out.ok(runEconomyPheromoneSim({ halfLifeMs, deposits: parsed, now }))
      } catch (err) {
        out.err('PHEROMONE_SIM_FAILED', getErrorMessage(err))
      }
    })

  return cmd
}
