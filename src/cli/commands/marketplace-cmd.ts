/*!
 * agf marketplace — CLI surface for the git-based skill/plugin marketplace.
 *
 * WHY: Exposes MarketplaceStore add/list/install/upgrade/remove as CLI
 * subcommands with the standard {ok,data,meta} envelope.
 *
 * Composes with: marketplace.ts (core), marketplace-cli.ts (envelope builder),
 *               open-store.ts (SqliteStore).
 */

import { Command } from 'commander'
import path from 'node:path'
import { createCliOutput } from '../shared/cli-output.js'
import { createLogger } from '../../core/utils/logger.js'
import { MarketplaceRegistry as MarketplaceStore } from '../../core/marketplace/marketplace.js'
import { buildMarketplaceEnvelope } from '../../core/marketplace/marketplace-cli.js'

const log = createLogger({ layer: 'cli', source: 'marketplace-cmd.ts' })

export function marketplaceCommand(): Command {
  log.info('marketplace command registered')
  const cmd = new Command('marketplace').description('Manage the agf skill/plugin marketplace')

  cmd
    .command('list')
    .description('List registered sources and available items')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--select <path>', 'Dot-path filter on data')
    .action((opts: { dir: string; select?: string }) => {
      const out = createCliOutput('marketplace.list')
      const cacheDir = path.join(opts.dir, '.agf-marketplace')
      const store = new MarketplaceStore({ rootCacheDir: cacheDir })
      const result = buildMarketplaceEnvelope('list', {
        getSources: () => store.list(),
        getItems: (sourceId) => (sourceId ? store.getItems(sourceId) : []),
      })
      if (result.ok) out.ok(result.data)
      else out.err(result.code, result.error)
    })

  cmd
    .command('add <url>')
    .description('Add a git source and index its items')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .action(async (url: string, opts: { dir: string }) => {
      const out = createCliOutput('marketplace.add')
      const cacheDir = path.join(opts.dir, '.agf-marketplace')
      const store = new MarketplaceStore({ rootCacheDir: cacheDir })
      try {
        const result = await store.addSource(url)
        out.ok({ source: result.source, items: result.items.length })
      } catch (err) {
        out.err('ADD_FAILED', (err as Error).message)
      }
    })

  return cmd
}
