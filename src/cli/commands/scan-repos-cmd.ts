/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * `agf scan-repos [root]` — deterministic external-repo insight explorer.
 * Fingerprints sibling repos under `root` (default `..`), diffs their
 * capabilities against agf's own set, and emits ranked insights. Optionally
 * writes a Markdown evaluation (`--report`) and/or seeds the graph with a
 * backlog epic+tasks (`--ingest`). Zero LLM, zero network.
 */

import { Command } from 'commander'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { scanRepos } from '../../core/scan/repo-scanner.js'
import { renderReport, buildInsightNodes } from '../../core/scan/insight-report.js'
import { agfCapabilities, CAPABILITY_LEXICON } from '../../core/scan/capability-lexicon.js'
import { checkPresentInAgf, type AgfPresenceChecker } from '../../core/scan/agf-presence-checker.js'
import { computeScanEval, type GoldEntry, type ScanEvalResult } from '../../core/scan/scan-eval.js'

const log = createLogger({ layer: 'cli', source: 'scan-repos-cmd.ts' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLD_FIXTURE_PATH = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'scan', 'gold-capabilities.json')

/**
 * Evaluate agf's real capability-presence predictions against the hand-labeled
 * gold fixture (node_wire_6578bd0e8998 — scan-eval wire). Read-only: never
 * mutates the graph. Uses checkPresentInAgf (Bloom-skip + NCD near-match) so
 * natural-language gold phrases (not just lexicon tags) get a fair fuzzy shot.
 */
export function evaluateGoldCapabilities(goldPath: string = GOLD_FIXTURE_PATH): ScanEvalResult {
  const gold: GoldEntry[] = JSON.parse(readFileSync(goldPath, 'utf-8'))

  const exactTags = agfCapabilities()
  const corpus = CAPABILITY_LEXICON.filter((s) => exactTags.has(s.tag)).map((s) => `${s.label} ${s.insight}`)
  const checker: AgfPresenceChecker = { exactTags, corpus }

  const predictions = gold.map((g) => ({
    capability: g.capability,
    presentInAgf: checkPresentInAgf(g.capability, checker),
  }))

  return computeScanEval(gold, predictions)
}

/** Builds the `agf scan-repos` CLI command (Commander definition). */
export function scanReposCommand(): Command {
  log.info('scan-repos command registered')
  return new Command('scan-repos')
    .description(
      'Explora repos vizinhos: fingerprint determinístico + diff de capacidades vs agf → insights ranqueados',
    )
    .argument('[root]', 'Raiz externa a varrer (cada subdir = um repo)', '..')
    .option('--exclude <name...>', 'Nomes de diretório a ignorar')
    .option('--self', 'Inclui o próprio repo agent-graph-flow (excluído por padrão)', false)
    .option('--report <file>', 'Escreve a avaliação ranqueada em Markdown neste caminho')
    .option('--ingest', 'Insere um epic + tasks de backlog no grafo a partir dos gaps (dedup)', false)
    .option('--max-depth <n>', 'Profundidade de descida (>=2 entra em monorepos)', (v) => Number.parseInt(v, 10), 1)
    .option('-d, --dir <dir>', 'Diretório do projeto agf (alvo do --ingest)', process.cwd())
    .option('--eval', 'Avalia precision/recall/F1 do presentInAgf contra o gold-set rotulado (read-only)', false)
    .option('--distinctive-terms', 'Computa termos TF-IDF distintivos por repo (fora do léxico de capacidades)', false)
    .option(
      '--forage-stop',
      'Com --distinctive-terms: para cedo (MVT/Charnov) quando o ganho marginal de termos novos cai',
      false,
    )
    .option(
      '--dedupe',
      'Com --max-depth>=2: colapsa subdirs quase-idênticos de monorepo (SimHash) num único repo',
      false,
    )
    .action(
      (
        root: string,
        opts: {
          exclude?: string[]
          self: boolean
          report?: string
          ingest: boolean
          maxDepth: number
          dir: string
          eval: boolean
          distinctiveTerms: boolean
          forageStop: boolean
          dedupe: boolean
        },
      ) => {
        const out = createCliOutput('scan-repos')

        if (opts.eval) {
          out.ok(evaluateGoldCapabilities())
          return
        }

        let result
        try {
          result = scanRepos(root, {
            exclude: opts.exclude,
            includeSelf: opts.self,
            git: true,
            maxDepth: opts.maxDepth,
            distinctiveTerms: opts.distinctiveTerms,
            forageStop: opts.forageStop,
            dedupe: opts.dedupe,
          })
        } catch (err) {
          out.err('NOT_FOUND', err instanceof Error ? err.message : String(err))
          return
        }

        if (result.summary.repoCount === 0) {
          out.fail('NO_REPOS', `Nenhum repo escaneável em ${result.root}`, result)
          return
        }

        let reportPath: string | undefined
        if (opts.report) {
          const md = renderReport(result, { generatedAt: new Date().toISOString().slice(0, 10) })
          reportPath = path.resolve(opts.report)
          mkdirSync(path.dirname(reportPath), { recursive: true })
          writeFileSync(reportPath, md, 'utf-8')
        }

        let ingested: { epic: string; tasks: number; skipped: number } | undefined
        if (opts.ingest) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            // Dedup: collect capabilities already ingested by previous scan-repos runs.
            const skipCapabilities = new Set<string>()
            for (const node of store.toGraphDocument().nodes) {
              const meta = node.metadata as { source?: string; capability?: string } | undefined
              if (meta?.source === 'scan-repos' && typeof meta.capability === 'string') {
                skipCapabilities.add(meta.capability)
              }
            }
            const { epic, tasks, edges } = buildInsightNodes(result, {
              now: new Date().toISOString(),
              label: new Date().toISOString().slice(0, 10),
              skipCapabilities,
            })
            store.insertNode(epic)
            for (const t of tasks) store.insertNode(t)
            for (const e of edges) store.insertEdge(e)
            ingested = { epic: epic.id, tasks: tasks.length, skipped: skipCapabilities.size }
          } finally {
            store.close()
          }
        }

        out.ok(
          {
            root: result.root,
            repos: result.repos,
            insights: result.insights,
            summary: result.summary,
            reportPath,
            ingested,
          },
          { count: result.summary.uniqueGapCount },
        )
      },
    )
}
