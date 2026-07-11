/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import path from 'node:path'
import { openStoreOrFail } from '../open-store.js'
import { readFileContent } from '../../core/parser/file-reader.js'
import { extractEntities } from '../../core/parser/extract.js'
import { segment } from '../../core/parser/segment.js'
import { buildDocTree } from '../../core/rag/doc-tree.js'
import { insertTreeNodes } from '../../core/rag/doc-tree-store.js'
import { convertToGraph } from '../../core/importer/prd-to-graph.js'
import { importShardedPrd, shardPrdText } from '../../core/importer/prd-sharding.js'
import { computeAcCoverage } from '../../core/importer/ac-coverage.js'
import { diffPrd, type PrdDiffResult } from '../../core/parser/prd-diff.js'
import { fireBeforeImport, fireAfterImport } from '../../core/plugins/import-hooks.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { sanitizeText } from '../../core/security/input-sanitizer.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'import-cmd.ts' })

/**
 * Diff de seções entre o raw previamente importado (ou `null`) e o novo texto.
 * Sem import anterior → tudo "added". Pura — diretamente testável.
 */
export function buildImportDiff(prevRaw: string | null, newText: string): PrdDiffResult {
  return diffPrd(prevRaw ?? '', newText)
}

/** Builds the `agf import` CLI command (Commander definition). */
export function importCommand(): Command {
  return new Command('import-prd')
    .description(
      'Importa um PRD (.md/.txt/.pdf/.html) para o grafo — tasks recebem AC (extraído ou sintetizado); report inclui data.acCoverage (fase SHAPE)',
    )
    .argument('<file>', 'Caminho do arquivo PRD')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--force', 'Re-importa mesmo se o arquivo já foi importado (cria nodes duplicados)', false)
    .option('--allow-empty', 'Sai 0 mesmo quando o arquivo produz zero nodes (default: sai 1 com dica)', false)
    .option(
      '--diff',
      'Preview: compara o arquivo com o último import (added/removed/modified), sem mutar o grafo',
      false,
    )
    .option(
      '--build-tree',
      'Constrói um índice ToC-tree hierárquico do documento (p/ `agf search --hierarchical`)',
      false,
    )
    .option(
      '--shard',
      'PRDs grandes: particiona por seção (## Heading) e importa cada shard isoladamente (falha isolada por shard)',
      false,
    )
    .option('--shard-budget <n>', 'Orçamento aproximado de tokens por shard (1 token ≈ 4 chars)', '8000')
    .action(
      async (
        file: string,
        opts: {
          dir: string
          force: boolean
          allowEmpty: boolean
          diff: boolean
          buildTree: boolean
          shard: boolean
          shardBudget: string
        },
      ) => {
        const out = createCliOutput('import-prd')
        const filePath = path.resolve(file)
        const store = openStoreOrFail(opts.dir)

        if (!store.getProject()) {
          store.initProject(path.basename(opts.dir))
          log.info('Project initialized', { name: path.basename(opts.dir) })
        }

        // --diff: preview-only. Compara o novo texto com o raw do último import.
        if (opts.diff) {
          try {
            const fileResult = await readFileContent(filePath)
            const prevRaw = store.getImportRaw(filePath)
            const diff = buildImportDiff(prevRaw, fileResult.text)
            out.ok({
              source: filePath,
              hadPriorImport: prevRaw !== null,
              diff: {
                addedCount: diff.addedCount,
                removedCount: diff.removedCount,
                modifiedCount: diff.modifiedCount,
                unchangedCount: diff.unchangedCount,
              },
            })
          } catch (err) {
            out.err('PARSE_ERROR', `Diff falhou: ${getErrorMessage(err)}`)
          } finally {
            store.close()
          }
          return
        }

        if (!opts.force && store.hasImport(filePath)) {
          log.error(`Arquivo já importado: ${filePath}. Use --force para re-importar (cria duplicados).`)
          store.close()
          out.err('ALREADY_IMPORTED', `Arquivo já importado: ${filePath}. Use --force para re-importar.`)
          return
        }

        try {
          // before:import — plugins podem abortar antes de qualquer mutação.
          const pre = await fireBeforeImport({ filePath })
          if (pre.aborted) {
            store.close()
            out.err('IMPORT_ABORTED', `Import abortado por hook: ${pre.abortReason ?? 'sem motivo'}`)
            return
          }

          const fileResult = await readFileContent(filePath)

          // node_wire_4273c20e737b — input-sanitizer wire. Strips invisible
          // Unicode (zero-width chars, bidi overrides) before the text ever
          // reaches parsing/storage; injection markers are left in place so
          // they remain visible in the graph, but flagged in the envelope.
          const sanitizeReport = sanitizeText(fileResult.text)
          fileResult.text = sanitizeReport.sanitized

          const graph = opts.shard
            ? importShardedPrd(fileResult.text, { tokenBudget: Number(opts.shardBudget), sourceFile: filePath })
            : convertToGraph(extractEntities(fileResult.text), filePath)

          store.bulkInsert(graph.nodes, graph.edges)
          store.recordImport(filePath, graph.nodes.length, graph.edges.length, fileResult.text)
          store.createSnapshot()

          // Opt-in: hierarchical ToC-tree index for `agf search --hierarchical`.
          // Additive (separate doc_tree_nodes table) — never affects graph/edges.
          let treeNodes = 0
          if (opts.buildTree) {
            const tree = buildDocTree(segment(fileResult.text), filePath)
            insertTreeNodes(store.getDb(), filePath, tree)
            treeNodes = tree.length
          }

          if (graph.nodes.length === 0 && fileResult.text.length > 0 && !opts.allowEmpty) {
            log.error(
              `Nenhuma entidade extraída de ${filePath} (texto ${fileResult.text.length} chars). Use --allow-empty se for intencional.`,
            )
            store.close()
            out.err('EMPTY_EXTRACTION', `Nenhuma entidade extraída. Use --allow-empty se for intencional.`)
            return
          }

          // after:import — plugins recebem o resultado (auditoria, etc.).
          await fireAfterImport({ filePath, nodes: graph.nodes.length, edges: graph.edges.length })

          out.ok({
            nodes: graph.nodes.length,
            edges: graph.edges.length,
            source: filePath,
            treeNodes,
            acCoverage: computeAcCoverage(graph.nodes),
            ...(opts.shard
              ? {
                  sharded: true,
                  shardsProcessed: shardPrdText(fileResult.text, Number(opts.shardBudget)).length,
                  failedShards: (graph as ReturnType<typeof importShardedPrd>).failedShards,
                }
              : {}),
            ...(sanitizeReport.injectionDetected || sanitizeReport.invisibleCharsRemoved > 0
              ? {
                  security: {
                    injectionDetected: sanitizeReport.injectionDetected,
                    injectionPatterns: sanitizeReport.injectionPatterns,
                    invisibleCharsRemoved: sanitizeReport.invisibleCharsRemoved,
                  },
                }
              : {}),
          })
        } catch (err) {
          log.error(`Import falhou: ${getErrorMessage(err)}`)
          out.err('PARSE_ERROR', `Import falhou: ${getErrorMessage(err)}`)
        } finally {
          store.close()
        }
      },
    )
}
