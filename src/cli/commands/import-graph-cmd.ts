/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { mergeGraph } from '../../core/importer/import-graph.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { errMessage, isGraphDocumentShape } from '../shared/coerce.js'
import type { GraphDocument } from '../../core/graph/graph-types.js'

const log = createLogger({ layer: 'cli', source: 'import-graph-cmd.ts' })

/** Builds the `agf import-graph` CLI command (Commander definition). */
export function importGraphCommand(): Command {
  log.info('import-graph command registered')
  return new Command('import-graph')
    .description('Funde um grafo JSON exportado no projeto (tool MCP `import_graph`)')
    .argument('<file>', 'Arquivo JSON do grafo')
    .option('--dry-run', 'Mostra o que seria importado sem gravar', false)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((file: string, opts: { dryRun: boolean; dir: string }) => {
      const out = createCliOutput('import-graph')

      let rawText: string
      try {
        rawText = readFileSync(file, 'utf-8')
      } catch (e) {
        out.err('FILE_READ_ERROR', `Não foi possível ler ${file}: ${errMessage(e)}`)
        return
      }

      let incoming: GraphDocument
      try {
        incoming = JSON.parse(rawText) as GraphDocument
      } catch (e) {
        out.err('PARSE_ERROR', `JSON inválido em ${file}: ${errMessage(e)}`)
        return
      }

      if (!isGraphDocumentShape(incoming)) {
        out.err('INVALID_GRAPH', `${file} não é um GraphDocument (esperado { project, nodes[], edges[] })`)
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const result = mergeGraph(store, incoming, { dryRun: opts.dryRun })
        out.ok({
          dryRun: opts.dryRun,
          nodesInserted: result.nodesInserted,
          edgesInserted: result.edgesInserted,
          nodesSkipped: result.nodesSkipped,
          edgesSkipped: result.edgesSkipped,
        })
      } catch (e) {
        out.err('INVALID_GRAPH', `Falha ao fundir o grafo: ${errMessage(e)}`)
      } finally {
        store.close()
      }
    })
}
