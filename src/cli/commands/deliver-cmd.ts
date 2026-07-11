/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { buildClientFromProject } from '../shared/provider-context.js'
import { detectAgfLlm, buildDelegatedEnvelope } from '../shared/delegation.js'
import { runBuildOrchestration } from '../shared/run-build.js'
import { normalizeInput, type IntakeSource, type NormalizeDeps } from '../../core/intake/normalize-input.js'
import { supportsVision } from '../../core/llm/model-capabilities.js'
import { generatePrd, type PrdScaffold } from '../../core/prd/generate-prd.js'
import { extractEntities } from '../../core/parser/extract.js'
import { convertToGraph } from '../../core/importer/prd-to-graph.js'
import { detectProjectMode } from '../../core/scaffolder/corpus.js'
import { deriveCorpusQuery, seedGreenfieldCorpus, githubCorpusSignals } from '../../core/scaffolder/github-corpus.js'
import { decideScaffold } from '../../core/rag-out/gate.js'
import { loadDefaultScaffoldCorpus } from '../../core/rag-out/scaffold-corpus.js'
import { detectProjectLanguage, type Language } from '../../core/rag-out/language.js'
import {
  estimateRagOutEconomy,
  scaffoldCostBreakdown,
  toLeverEvent,
  toLeverEventFromBreakdown,
} from '../../core/rag-out/economy.js'
import { discoverEnabled, persistDiscover } from '../../core/tool-compress/discover.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { recordLeverEvent } from '../../core/economy/economy-lever-ledger.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type Database from 'better-sqlite3'

/**
 * RAG-OUT (node_ed0861c85aa6): decide se o goal casa com um scaffold recorrente
 * (ex. prd-software) — se casar acima do threshold + noveltyFloor, retorna os
 * slots a preencher (prompt reduzido em generatePrd); senão undefined (caminho
 * de sempre, sem 3º argumento — byte-idêntico). Extraído p/ ser testável sem
 * montar todo o pipeline de `deliver`.
 */
export function decidePrdScaffold(
  goalText: string,
  projectLanguage?: Language,
  corpusSignals?: Partial<Record<string, number>>,
): PrdScaffold | undefined {
  const decision = decideScaffold(goalText, loadDefaultScaffoldCorpus(), { projectLanguage, corpusSignals })
  if (decision.decision !== 'recover' || !decision.best) return undefined
  return { slots: decision.best.slots }
}

/**
 * RAG-OUT (node_c9a4960a2fff): grava o lever `scaffold_recovery` no
 * economy_lever_ledger — mesmo padrão de `recordEconomy` (montar-output-cmd.ts):
 * sempre grava (best-effort), `accepted` distingue recover real de passthrough.
 */
export function recordScaffoldRecoveryLever(
  db: Database.Database,
  goalText: string,
  sessionId: string,
  projectLanguage?: Language,
  corpusSignals?: Partial<Record<string, number>>,
): void {
  const decision = decideScaffold(goalText, loadDefaultScaffoldCorpus(), { projectLanguage, corpusSignals })
  const economy = estimateRagOutEconomy(decision)
  const structureTokens = decision.decision === 'recover' ? economy.baselineTokens - economy.actualTokens : 0
  const slotCount = decision.best?.slots.length ?? 0
  const breakdown = scaffoldCostBreakdown({ structureTokens, slotTokens: slotCount * 12 })
  recordLeverEvent(db, toLeverEvent(economy, sessionId))
  recordLeverEvent(db, toLeverEventFromBreakdown(breakdown, sessionId))
}

const log = createLogger({ layer: 'cli', source: 'deliver-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

function imageToDataUrl(path: string): string {
  const ext = extname(path).slice(1).toLowerCase() || 'png'
  const mime = ext === 'jpg' ? 'jpeg' : ext
  return `data:image/${mime};base64,${readFileSync(path).toString('base64')}`
}

function projectId(store: SqliteStore): string {
  return store.getProject()?.id ?? 'default'
}

const VISION_PROMPT =
  'Descreva esta imagem (ex.: um board/kanban/wireframe) como requisitos de software: ' +
  'entidades, colunas/estados, ações e regras. Seja objetivo e estruturado.'

/** Builds the `agf deliver` CLI command (Commander definition). */
export function deliverCommand(): Command {
  log.info('deliver command registered')
  return new Command('deliver')
    .description('Pedido → PRD → grafo → build TDD, autônomo e econômico (texto, --file ou --image)')
    .argument('[pedido]', 'O que construir, em linguagem natural (omita com --file/--image)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--file <path>', 'Lê o pedido de um arquivo (md/pdf/html/docx/txt)')
    .option('--image <path>', 'Lê o pedido de uma imagem (OCR local; visão só se disponível)')
    .option('-o, --out <file>', 'Arquivo do PRD gerado', 'PRD.md')
    .option('--max <n>', 'Teto de passos do orquestrador (cost-runaway)', '20')
    .option('--live', 'Implementa com o modelo real (autopilot --live)', false)
    .option('--test-cmd <cmd>', 'Comando de teste no --live', 'npm test')
    .option('--provider <id>', 'Provider (ex.: ollama, openrouter); default do projeto/copilot')
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1)')
    .option('--no-fetch', 'Não busca exemplos públicos no github (greenfield)')
    .action(
      async (
        pedido: string | undefined,
        opts: {
          dir: string
          file?: string
          image?: string
          out: string
          max: string
          live: boolean
          testCmd: string
          provider?: string
          baseUrl?: string
          fetch: boolean
        },
      ) => {
        const out = createCliOutput('deliver')

        let source: IntakeSource
        if (opts.image) source = { kind: 'image', path: opts.image }
        else if (opts.file) source = { kind: 'file', path: opts.file }
        else if (pedido && pedido.trim()) source = { kind: 'text', value: pedido }
        else {
          out.err(
            'INVALID_INPUT',
            'Informe um pedido, --file <arquivo> ou --image <imagem>. Ex.: agf deliver "crie um kanban"',
          )
          return
        }

        const store = openStoreOrFail(opts.dir)
        const ledger = new TokenLedger()
        try {
          if (!store.getProject()) store.initProject(basename(opts.dir))

          // Modo delegado: o pipeline do deliver (PRD + build) é LLM-heavy. Sem
          // provider próprio, não quebra — devolve o pedido + o fluxo delegado p/
          // a CLI-agente que dirige conduzir (any-CLI).
          const detected = detectAgfLlm(store, process.env, { provider: opts.provider, baseUrl: opts.baseUrl })
          if (!detected.available) {
            out.ok(
              await buildDelegatedEnvelope({
                detected,
                adHocPrompt:
                  source.kind === 'text'
                    ? source.value
                    : `deliver ${source.kind}: ${'path' in source ? source.path : ''}`,
              }),
            )
            return
          }

          const { client, providerLabel } = buildClientFromProject(store, {
            provider: opts.provider,
            baseUrl: opts.baseUrl,
          })
          progress(`≡ deliver via ${providerLabel} (${client.modelFor('plan')}) — normalizar → PRD → grafo → build\n`)

          const planModel = client.modelFor('plan')
          const deps: NormalizeDeps = {}
          if (source.kind === 'image' && supportsVision(planModel)) {
            deps.visionFallback = async (imagePath: string) => {
              const res = await client.run('plan', VISION_PROMPT, undefined, undefined, undefined, [
                imageToDataUrl(imagePath),
              ])
              ledger.recordCall('deliver_intake', {
                model: res.model,
                prompt: VISION_PROMPT,
                response: res.text,
                reportedIn: res.tokensIn,
                reportedOut: res.tokensOut,
                reportedCachedIn: res.cachedTokensIn,
                reportedReasoning: res.reasoningTokens,
                fromCache: res.fromCache,
              })
              return res.text
            }
          }
          progress('[1/4] normalizando entrada (determinístico)…')
          const norm = await normalizeInput(source, deps)
          progress(
            `  ✓ fonte: ${norm.source}; ${norm.tokensSaved} token(s) evitados no pré-processo (${norm.tokensAfter} tok destilados)`,
          )
          if (norm.tokensSaved > 0) {
            recordLeverEvent(store.getDb(), {
              sessionId: `deliver_${projectId(store)}`,
              lever: norm.source === 'ocr' ? 'intake_ocr' : 'intake_normalize',
              tokensBefore: norm.tokensBefore,
              tokensAfter: norm.tokensAfter,
              saved: norm.tokensSaved,
              accepted: true,
              gateOutcome: 'accepted',
            })
          }

          progress('[2/4] gerando PRD…')
          const projectLanguage = detectProjectLanguage(opts.dir)
          const corpusSignals = githubCorpusSignals(store)
          const scaffold = decidePrdScaffold(norm.text, projectLanguage, corpusSignals)
          const md = await generatePrd(
            norm.text,
            {
              generate: async (prompt) => {
                const res = await client.run('plan', prompt)
                ledger.recordCall('deliver_prd', {
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
            },
            scaffold,
          )
          recordScaffoldRecoveryLever(
            store.getDb(),
            norm.text,
            `deliver_${projectId(store)}`,
            projectLanguage,
            corpusSignals,
          )
          const outPath = join(opts.dir, opts.out)
          writeFileSync(outPath, md, 'utf8')
          progress(`  ✓ PRD → ${outPath} (${md.length} chars)`)

          progress('[3/4] importando para o grafo de execução…')
          const entities = extractEntities(md)
          const graph = convertToGraph(entities, outPath)
          store.bulkInsert(graph.nodes, graph.edges)
          store.recordImport?.(outPath, graph.nodes.length, graph.edges.length)
          progress(`  ✓ ${graph.nodes.length} nós, ${graph.edges.length} arestas`)

          if (opts.fetch !== false && detectProjectMode(opts.dir) === 'greenfield') {
            const q = deriveCorpusQuery(norm.text)
            if (q) {
              progress(`  · greenfield: buscando exemplos públicos para "${q}"…`)
              try {
                const { seeded } = await seedGreenfieldCorpus(store, q)
                if (seeded > 0) {
                  progress(`  ✓ ${seeded} exemplo(s) público(s) cacheado(s) (semente determinística)`)
                  recordLeverEvent(store.getDb(), {
                    sessionId: `deliver_${projectId(store)}`,
                    lever: 'github_corpus',
                    tokensBefore: 0,
                    tokensAfter: 0,
                    saved: 0,
                    accepted: true,
                    gateOutcome: 'accepted',
                  })
                }
              } catch (err) {
                log.warn('deliver:seed-failed', { error: err instanceof Error ? err.message : String(err) })
              }
            }
          }

          progress(`[4/4] construindo (autopilot${opts.live ? ' --live' : ' --simulate'})…`)
          const report = await runBuildOrchestration(store, {
            dir: opts.dir,
            prd: opts.out,
            maxSteps: Math.max(1, parseInt(opts.max, 10) || 20),
            live: opts.live,
            testCmd: opts.testCmd,
            ledger,
            onLog: progress,
          })

          if (ledger.entries().length > 0) {
            // persistLedger já grava a economia (cache + levers) na mesma costura.
            persistLedger(store.getDb(), ledger, { sessionId: `deliver_${projectId(store)}`, provider: providerLabel })
          }
          const t = ledger.totals()
          const data = {
            steps: report.steps,
            stopped: report.stopped,
            tokensIn: t.tokensIn,
            tokensOut: t.tokensOut,
            tokensTotal: t.total,
            hint: "'agf status' mostra provider/cache/economia; 'agf next' puxa a próxima task.",
          }

          if (report.stopped === 'escalation') {
            out.fail('ESCALATION', `Build stopped at escalation after ${report.steps} steps`, data)
          } else {
            out.ok(data)
          }
        } catch (err) {
          out.err('DELIVER_FAILED', err instanceof Error ? err.message : String(err))
        } finally {
          if (discoverEnabled()) persistDiscover(join(opts.dir, 'workflow-graph', 'compress-discover.json'))
          store.close()
        }
      },
    )
}
