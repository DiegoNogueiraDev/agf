/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { z } from 'zod/v4'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { errMessage } from '../shared/coerce.js'
import { graphToCsv } from '../../core/graph/csv-export.js'
import { graphToMermaid } from '../../core/graph/mermaid-export.js'
import { validateMermaidExportInput } from '../../core/graph/validation.js'

const log = createLogger({ layer: 'cli', source: 'export-cmd.ts' })

const EXPORT_FORMATS = ['json', 'csv', 'mermaid'] as const
type ExportFormat = (typeof EXPORT_FORMATS)[number]

/** Builds the `agf export` CLI command (Commander definition). */
export function exportCommand(): Command {
  log.info('export command registered')
  return new Command('export')
    .description('Serializa o grafo como JSON, CSV ou diagrama Mermaid (tool MCP `export`)')
    .option('-o, --out <file>', 'Grava num arquivo (default: stdout)')
    .option('-f, --format <format>', `Formato de saída: ${EXPORT_FORMATS.join(' | ')}`, 'json')
    .option('--direction <dir>', 'Direção do diagrama Mermaid: TB | LR | BT | RL (--format mermaid)')
    .option('--no-edge-labels', 'Omite os labels de relacionamento das arestas do diagrama Mermaid')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((opts: { out?: string; format: string; dir: string; direction?: string; edgeLabels: boolean }) => {
      const out = createCliOutput('export')
      if (!EXPORT_FORMATS.includes(opts.format as ExportFormat)) {
        out.err('INVALID_FORMAT', `Formato desconhecido: ${opts.format}. Use ${EXPORT_FORMATS.join(' | ')}.`)
        return
      }
      let mermaidOptions: { direction?: 'TB' | 'LR' | 'BT' | 'RL'; includeEdgeLabels?: boolean } | undefined
      if (opts.format === 'mermaid') {
        try {
          mermaidOptions = validateMermaidExportInput({
            direction: opts.direction,
            includeEdgeLabels: opts.edgeLabels,
          })
        } catch (e) {
          if (e instanceof z.ZodError) {
            out.err(
              'INVALID_DIRECTION',
              `Opções de export mermaid inválidas: ${e.issues.map((i) => i.message).join('; ')}`,
            )
            return
          }
          throw e
        }
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const doc = store.toGraphDocument()
        if (opts.format === 'csv') {
          const csv = graphToCsv(doc)
          if (opts.out) {
            try {
              writeFileSync(opts.out, csv + '\n', 'utf-8')
            } catch (e) {
              out.err('WRITE_FAILED', `Não foi possível gravar em ${opts.out}: ${errMessage(e)}`)
              return
            }
            out.ok({ path: opts.out, nodeCount: doc.nodes.length })
          } else {
            out.ok({ csv }, { count: doc.nodes.length })
          }
          return
        }
        if (opts.format === 'mermaid') {
          const mermaid = graphToMermaid(doc.nodes, doc.edges, mermaidOptions)
          if (opts.out) {
            try {
              writeFileSync(opts.out, mermaid, 'utf-8')
            } catch (e) {
              out.err('WRITE_FAILED', `Não foi possível gravar em ${opts.out}: ${errMessage(e)}`)
              return
            }
            out.ok({ path: opts.out, nodeCount: doc.nodes.length })
          } else {
            out.ok({ mermaid }, { count: doc.nodes.length })
          }
          return
        }
        if (opts.out) {
          try {
            writeFileSync(opts.out, JSON.stringify(doc, null, 2) + '\n', 'utf-8')
          } catch (e) {
            out.err('WRITE_FAILED', `Não foi possível gravar em ${opts.out}: ${errMessage(e)}`)
            return
          }
          out.ok({ path: opts.out, nodeCount: doc.nodes.length, edgeCount: doc.edges.length })
        } else {
          out.ok(doc, { count: doc.nodes.length })
        }
      } finally {
        store.close()
      }
    })
}
