/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { resolve } from 'node:path'
import { openStoreOrFail } from '../open-store.js'
import { generateId } from '../../core/utils/id.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { RelationType } from '../../core/graph/graph-types.js'

const log = createLogger({ layer: 'cli', source: 'edge-cmd.ts' })

/** Builds the `agf edge` CLI command (Commander definition). */
export function edgeCommand(): Command {
  log.info('edge command registered')
  const cmd = new Command('edge').description('CRUD de arestas do grafo (add/rm/ls)')

  cmd
    .command('add')
    .description('Cria uma aresta entre dois nós')
    .argument('<from>', 'ID do nó de origem')
    .argument('<to>', 'ID do nó de destino')
    .option('--type <rel>', 'Tipo de relação (depends_on, blocks, related_to, …)', 'related_to')
    .option('--reason <reason>', 'Motivo da relação')
    .option('--force-self-edge', 'Permite from===to (ex.: self-loop legítimo de Petri net)', false)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (from: string, to: string, opts: { type: string; reason?: string; forceSelfEdge: boolean; dir: string }) => {
        const out = createCliOutput('edge.add')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (!store.getNodeById(from)) {
            out.err('NOT_FOUND', `Nó de origem não encontrado: ${from}`)
            return
          }
          if (!store.getNodeById(to)) {
            out.err('NOT_FOUND', `Nó de destino não encontrado: ${to}`)
            return
          }
          if (from === to && !opts.forceSelfEdge) {
            out.err(
              'SELF_EDGE',
              `Aresta auto-referente rejeitada: ${from} -> ${to}. Use --force-self-edge se intencional.`,
            )
            return
          }
          const id = generateId('edge')
          store.insertEdge({
            id,
            from,
            to,
            relationType: opts.type as RelationType,
            reason: opts.reason,
            createdAt: new Date().toISOString(),
          })
          out.ok({ id, from, to, relationType: opts.type }, { dir: resolve(opts.dir) })
        } finally {
          store.close()
        }
      },
    )

  cmd
    .command('rm')
    .description('Remove uma aresta')
    .argument('<id>', 'ID da aresta')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((id: string, opts: { dir: string }) => {
      const out = createCliOutput('edge.rm')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const ok = store.deleteEdge(id)
        if (!ok) {
          out.err('NOT_FOUND', `Aresta não encontrada: ${id}`)
        } else {
          out.ok({ id, removed: true }, { dir: resolve(opts.dir) })
        }
      } finally {
        store.close()
      }
    })

  cmd
    .command('ls')
    .description('Lista arestas (opcionalmente filtradas por nó)')
    .option('--from <id>', 'Filtra por nó de origem')
    .option('--to <id>', 'Filtra por nó de destino')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { from?: string; to?: string; dir: string }) => {
      const out = createCliOutput('edge.ls')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        let edges = store.getAllEdges()
        if (opts.from) edges = edges.filter((e) => e.from === opts.from)
        if (opts.to) edges = edges.filter((e) => e.to === opts.to)
        out.ok(edges, { count: edges.length })
      } finally {
        store.close()
      }
    })

  return cmd
}
