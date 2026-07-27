/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { buildClientFromProject } from '../shared/provider-context.js'
import { generatePrd } from '../../core/prd/generate-prd.js'
import { extractEntities } from '../../core/parser/extract.js'
import { convertToGraph } from '../../core/importer/prd-to-graph.js'
import { computeAcCoverage } from '../../core/importer/ac-coverage.js'
import { openStoreOrFail, openStoreIfExists } from '../open-store.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'generate-prd-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** Builds the `agf generate-prd` CLI command (Commander definition). */
export function generatePrdCommand(): Command {
  log.info('generate-prd command registered')
  return new Command('generate-prd')
    .description(
      'Gera um PRD.md com AC testável por task; --import já vira grafo (tasks recebem AC extraído/sintetizado; report inclui data.acCoverage)',
    )
    .argument('<descricao>', 'O que deve ser construído')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('-o, --out <file>', 'Arquivo de saída do PRD', 'PRD.md')
    .option('--import', 'Importa o PRD gerado para o grafo de execução', false)
    .option('--model <id>', "Modelo fixo; 'auto' usa o tier-router", 'auto')
    .option('--provider <id>', 'Provider (ex.: openrouter, ollama); default copilot ou $AGF_PROVIDER')
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1 p/ Ollama)')
    .action(
      async (
        descricao: string,
        opts: { dir: string; out: string; import: boolean; model: string; provider?: string; baseUrl?: string },
      ) => {
        const out = createCliOutput('generate-prd')
        const settingsStore = openStoreIfExists(opts.dir)
        const { client, providerLabel } = buildClientFromProject(settingsStore, {
          provider: opts.provider,
          baseUrl: opts.baseUrl,
          model: opts.model === 'auto' ? undefined : opts.model,
        })
        const ledger = new TokenLedger()
        progress(`[generate-prd] ${client.modelFor('plan')} via ${providerLabel} → gerando PRD…`)

        const md = await generatePrd(descricao, {
          generate: async (prompt) => {
            const res = await client.run('plan', prompt)
            ledger.recordCall('generate_prd', {
              model: res.model,
              prompt,
              response: res.text,
              reportedIn: res.tokensIn,
              reportedOut: res.tokensOut,
              reportedCachedIn: res.cachedTokensIn,
              reportedReasoning: res.reasoningTokens,
              fromCache: res.fromCache,
            })
            return res.text
          },
        })

        if (settingsStore?.getProject() && ledger.entries().length > 0) {
          persistLedger(settingsStore.getDb(), ledger, { sessionId: 'generate_prd', provider: 'copilot' })
        }
        settingsStore?.close()
        const outPath = join(opts.dir, opts.out)
        writeFileSync(outPath, md, 'utf8')
        progress(`✓ PRD gravado em ${outPath} (${md.length} chars)`)

        if (opts.import) {
          const store = openStoreOrFail(opts.dir)
          try {
            if (!store.getProject()) store.initProject(basename(opts.dir))
            const entities = extractEntities(md)
            const graph = convertToGraph(entities, outPath)
            store.bulkInsert(graph.nodes, graph.edges)
            store.recordImport?.(outPath, graph.nodes.length, graph.edges.length)
            out.ok({
              prdPath: outPath,
              chars: md.length,
              imported: true,
              nodeCount: graph.nodes.length,
              edgeCount: graph.edges.length,
              acCoverage: computeAcCoverage(graph.nodes),
            })
          } finally {
            store.close()
          }
        } else {
          out.ok({
            prdPath: outPath,
            chars: md.length,
            imported: false,
            hint: `Rode 'import-prd ${opts.out}' ou repita com --import.`,
          })
        }
      },
    )
}
