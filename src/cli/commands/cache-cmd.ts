/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * `agf cache stats` — prompt-cache hit/miss metrics from llm_call_ledger.
 * Task node_d9e047bf0083 (AC1: hit_rate, total_hits, total_misses, tokens_saved;
 * AC2: estimatedSavingsUsd delta vs uncached baseline).
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { computeCacheStats } from '../../core/llm/cache-stats.js'
import { listPlanTemplates } from '../../core/cache/plan-template-store.js'
import { getLiveZone, type LiveZone } from '../../core/economy/live-zone.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getErrorMessage } from '../../core/utils/errors.js'

const log = createLogger({ layer: 'cli', source: 'cache-cmd.ts' })

/** Pure core: parse a raw JSON message array and compute its frozen/live boundary. */
export function runCacheLiveZone(raw: string): LiveZone {
  let messages: unknown
  try {
    messages = JSON.parse(raw)
  } catch (err) {
    throw new Error(`invalid JSON: ${getErrorMessage(err)}`, { cause: err })
  }
  if (!Array.isArray(messages)) {
    throw new Error('expected a JSON array of messages')
  }
  return getLiveZone(messages)
}

/** Builds the `agf cache` CLI command with `stats` sub-command. */
export function cacheCommand(): Command {
  log.info('cache command registered')
  const cmd = new Command('cache').description('Prompt-cache management and statistics')

  cmd
    .command('stats')
    .description('Show cache hit rate, token savings, and estimated USD savings from llm_call_ledger')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('cache.stats')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const stats = computeCacheStats(store.getDb())
        out.ok(stats)
      } catch (err) {
        out.err('CACHE_STATS_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  const planStore = new Command('plan-store').description('Plan template cache operations')

  planStore
    .command('list')
    .description('List stored plan templates with metadata')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--limit <n>', 'Maximum templates to return', '20')
    .action((opts: { dir: string; limit: string }) => {
      const out = createCliOutput('cache.plan-store.list')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const templates = listPlanTemplates(store.getDb()).slice(0, parseInt(opts.limit, 10))
        out.ok({ templates, total: templates.length })
      } catch (err) {
        out.err('PLAN_STORE_LIST_FAILED', err instanceof Error ? err.message : String(err))
      }
    })

  cmd.addCommand(planStore)

  cmd
    .command('live-zone <file>')
    .description('Frozen/live boundary for a JSON message array — which messages are cacheable vs must stay live')
    .action((file: string) => {
      const out = createCliOutput('cache.live-zone')
      try {
        const raw = readFileSync(file, 'utf8')
        out.ok(runCacheLiveZone(raw))
      } catch (err) {
        out.err('LIVE_ZONE_FAILED', getErrorMessage(err))
      }
    })

  return cmd
}
