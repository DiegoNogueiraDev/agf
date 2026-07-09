/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceLimit } from '../shared/coerce.js'
import type { NodeStatus, NodeType } from '../../core/graph/graph-types.js'

const log = createLogger({ layer: 'cli', source: 'query-cmd.ts' })

/** Builds the `agf query` CLI command (Commander definition). */
export function queryCommand(): Command {
  log.info('query command registered')
  return new Command('query')
    .description('Consulta nós por tipo/status/parent/texto (query_graph/list)')
    .option('--type <type...>', 'Filtra por tipo(s)')
    .option('--status <status...>', 'Filtra por status')
    .option('--parent <id>', 'Filtra por nó pai')
    .option('--search <text>', 'Busca textual (FTS)')
    .option('--limit <n>', 'Máximo de resultados', '50')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (opts: { type?: string[]; status?: string[]; parent?: string; search?: string; limit: string; dir: string }) => {
        const out = createCliOutput('query')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          // §ECONOMY-HOOK: warn if query without --select
          const hasSelect = process.argv.includes('--select')
          if (!hasSelect && !opts.search) {
            log.warn('economy', {
              hint: 'Query sem --select: use --select para reduzir 80-90% tokens (ex: --select data[].id,data[].title)',
            })
          }

          let nodes = store.queryNodes({
            type: opts.type as NodeType[] | undefined,
            status: opts.status as NodeStatus[] | undefined,
            search: opts.search,
            limit: coerceLimit(opts.limit, 50),
          }).nodes
          if (opts.parent) nodes = nodes.filter((n) => n.parentId === opts.parent)

          out.ok(nodes, { count: nodes.length })
        } finally {
          store.close()
        }
      },
    )
}
