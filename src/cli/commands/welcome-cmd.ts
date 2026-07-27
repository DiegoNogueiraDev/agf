/*!
 * WHY: Zero-token orientation for a freshly-attached agent — one screen summarising
 * where the graph stands (stats), what to do next (next unblocked task), and which
 * two lifecycle skills drive the loop (planner + builder). Composes existing core
 * functions; introduces no new domain logic.
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { findNextTask } from '../../core/planner/next-task.js'

const log = createLogger({ layer: 'cli', source: 'welcome-cmd.ts' })

const LIFECYCLE_SKILLS = [
  {
    name: 'graph-backlog-generation',
    role: 'planner',
    when: 'no tasks or starting a new cycle',
    cmd: 'agf skill run graph-backlog-generation',
  },
  {
    name: 'graph-builder-leafcutter',
    role: 'builder',
    when: 'unblocked tasks exist — implement end-to-end',
    cmd: 'agf skill run graph-builder-leafcutter',
  },
]

export interface WelcomeSummary {
  stats: ReturnType<SqliteStore['getStats']>
  next: { id: string; title: string; status: string } | null
  skills: typeof LIFECYCLE_SKILLS
}

/** Pure function — used by the CLI action and by tests. */
export function buildWelcomeSummary(store: SqliteStore): WelcomeSummary {
  const stats = store.getStats()
  const doc = store.toGraphDocument()
  const nextResult = findNextTask(doc)
  const next = nextResult
    ? { id: nextResult.node.id, title: nextResult.node.title, status: nextResult.node.status }
    : null
  return { stats, next, skills: LIFECYCLE_SKILLS }
}

/** Builds the `agf welcome` CLI command (Commander definition). */
export function welcomeCommand(): Command {
  log.info('welcome command registered')
  return new Command('welcome')
    .description('Zero-token orientation: stats + next task + lifecycle skills')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { dir: string }) => {
      const out = createCliOutput('welcome')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const summary = buildWelcomeSummary(store)
        out.ok(summary)
      } finally {
        store.close()
      }
    })
}
