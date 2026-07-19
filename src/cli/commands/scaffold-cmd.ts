/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { Command } from 'commander'
import { scaffoldFile } from '../../tui/scaffold.js'
import {
  coupleNode,
  listGeneratedArtifacts,
  type CoupleNode,
  type ScaffoldValidator,
} from '../../core/scaffolder/couple.js'
import { resolveCorpusRoots, addCorpusRoot, scanMultiCorpus, detectProjectMode } from '../../core/scaffolder/corpus.js'
import { fetchOrGetCachedCorpus, getCachedGithubCorpus } from '../../core/scaffolder/github-corpus.js'
import { cloneOrPullCorpus, listCorpusRepos } from '../../core/scaffolder/corpus-cache.js'
import type { CreativeGenerator } from '../../core/scaffolder/creative-edge.js'
import type { ScaffoldDecider } from '../../core/scaffolder/decide.js'
import { emitTaskHook, flushHooks } from '../../core/hooks/hook-runtime.js'
import type { TieredModelClient } from '../../core/model-hub/model-client.js'
import { buildClientFromProject } from '../shared/provider-context.js'
import { TokenLedger } from '../../core/autonomy/token-ledger.js'
import { persistLedger } from '../../core/observability/llm-call-ledger.js'
import { openStoreOrFail } from '../open-store.js'
import { SqliteLearningStore } from '../../core/learning/sqlite-learning-store.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { GraphNode } from '../../core/graph/graph-types.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'scaffold-cmd.ts' })

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/**
 * Resolve the scaffold output path for `name` inside `scaffoldDir`, returning null
 * when `name` would escape the directory (path traversal via `../`, an absolute
 * path, or a separator-laden name). Pure + exported for unit testing (node_10d300122a04).
 */
export function resolveSafeScaffoldPath(scaffoldDir: string, name: string): string | null {
  if (!name.trim()) return null
  const filePath = resolve(scaffoldDir, `${name}.ts`)
  const rel = relative(scaffoldDir, filePath)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return filePath
}

function projectId(store: SqliteStore): string {
  return store.getProject()?.id ?? 'default'
}

interface CorpusCacheDeps {
  cloneOrPullCorpus: typeof cloneOrPullCorpus
  listCorpusRepos: typeof listCorpusRepos
}

/**
 * Clone/pull a reference repo into the local corpus cache (`~/.agf/corpus`)
 * for deeper deterministic scaffold scanning. Wires corpus-cache.ts (node_wire_b6233e54880f).
 */
export function cacheCorpusRepo(
  repo: string,
  deps: CorpusCacheDeps = { cloneOrPullCorpus, listCorpusRepos },
): { repo: string; cached: boolean; localPath: string | null; totalCached: number } {
  const localPath = deps.cloneOrPullCorpus(repo)
  return { repo, cached: localPath !== null, localPath, totalCached: deps.listCorpusRepos().length }
}

function toCoupleNode(n: GraphNode): CoupleNode {
  return {
    id: n.id,
    title: n.title,
    description: n.description,
    tags: n.tags,
    acceptanceCriteria: n.acceptanceCriteria,
    metadata: n.metadata,
  }
}

function buildValidator(store: SqliteStore): ScaffoldValidator {
  const cmd = store.getProjectSetting('test_cmd') ?? 'npm test'
  return async (workspaceDir: string): Promise<{ passed: boolean }> => {
    try {
      execSync(cmd, { cwd: workspaceDir, stdio: 'pipe', timeout: 120000, windowsHide: true })
      return { passed: true }
    } catch {
      return { passed: false }
    }
  }
}

function buildModelClient(store: SqliteStore): { client: TieredModelClient; providerId: string } | null {
  try {
    const ctx = buildClientFromProject(store)
    return { client: ctx.client, providerId: ctx.providerLabel }
  } catch {
    return null
  }
}

/** Builds the `agf scaffold` CLI command (Commander definition). */
export function scaffoldCommand(): Command {
  log.info('scaffold command registered')
  return new Command('scaffold')
    .description('Geração determinística de scaffold/boilerplate (acoplador determinístico, async via hooks)')
    .argument('[name]', 'Node ID (default) ou nome do scaffold (com --type)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--type <kind>', 'Tipo de boilerplate (class|fn|comp|iface|type)')
    .option('--apply', 'Aplica e persiste (default: dry-run preview)', false)
    .option('--auto', 'Varre todos os nodes backlog elegíveis', false)
    .option('--log', 'Mostra a proveniência de geração', false)
    .option('--corpus', 'Mostra as raízes de corpus + sinais agregados (dogfooding)', false)
    .option('--add-corpus <path>', 'Registra outro projeto como raiz de corpus')
    .option('--creative', 'Habilita a borda criativa (ÚNICO uso de token; requer login)', false)
    .option('--validate', 'Com --creative: só promove a mutação se passar nos testes', false)
    .option('--decide', 'Decisão-LLM mínima (cheap-tier) p/ desempatar o ranking', false)
    .option('--fetch <query>', 'Greenfield: varre github por scaffold/boilerplate e cacheia')
    .option('--cache-corpus <repo>', 'Clona/atualiza um repo (owner/name) no cache local de corpus (~/.agf/corpus)')
    .action(
      async (
        name: string | undefined,
        opts: {
          dir: string
          type?: string
          apply: boolean
          auto: boolean
          log: boolean
          corpus: boolean
          addCorpus?: string
          creative: boolean
          validate: boolean
          decide: boolean
          fetch?: string
          cacheCorpus?: string
        },
      ) => {
        const out = createCliOutput('scaffold')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (opts.type) {
            if (!name) {
              out.err('INVALID_INPUT', 'Informe um nome: `scaffold <nome> --type class|fn|comp|iface|type`.')
              return
            }
            const validTypes = ['class', 'fn', 'comp', 'iface', 'type'] as const
            const kind = opts.type
            if (!validTypes.includes(kind as (typeof validTypes)[number])) {
              out.err('INVALID_INPUT', `Tipo inválido: "${kind}". Valores: ${validTypes.join('|')}.`)
              return
            }
            const scaffoldTypeMap: Record<string, 'class' | 'function' | 'component' | 'interface' | 'type'> = {
              class: 'class',
              fn: 'function',
              comp: 'component',
              iface: 'interface',
              type: 'type',
            }
            const scaffoldDir = resolve(opts.dir, 'src')
            const content = scaffoldFile(name, scaffoldDir, scaffoldTypeMap[kind])
            if (opts.apply) {
              const filePath = resolveSafeScaffoldPath(scaffoldDir, name)
              if (filePath === null) {
                out.err('INVALID_INPUT', `Nome inválido (path traversal): "${name}". Use um identificador simples.`)
                return
              }
              mkdirSync(dirname(filePath), { recursive: true })
              writeFileSync(filePath, content, 'utf8')
              out.ok({ name, type: kind, file: relative(opts.dir, filePath), applied: true, content })
            } else {
              out.ok({ name, type: kind, preview: true, content, hint: 'use --apply para escrever' })
            }
            return
          }
          if (typeof opts.fetch === 'string') {
            const mode = detectProjectMode(opts.dir)
            const corpus = await fetchOrGetCachedCorpus(store, opts.fetch)
            const fromCache = getCachedGithubCorpus(store, opts.fetch) !== null
            out.ok({
              query: opts.fetch,
              mode,
              fromCache,
              repoCount: corpus.repos.length,
              repos: corpus.repos.slice(0, 8).map((r) => ({ stars: r.stars, fullName: r.fullName })),
              capabilitySignals: corpus.capabilitySignals,
            })
            return
          }
          if (typeof opts.cacheCorpus === 'string') {
            const result = cacheCorpusRepo(opts.cacheCorpus)
            if (!result.cached) {
              out.err('SCAFFOLD_FAILED', `Falha ao clonar/atualizar "${opts.cacheCorpus}" no cache local.`)
              return
            }
            out.ok(result)
            return
          }
          if (typeof opts.addCorpus === 'string') {
            const roots = addCorpusRoot(store, opts.addCorpus)
            out.ok({ roots, count: roots.length })
            return
          }
          if (opts.corpus) {
            const roots = resolveCorpusRoots(store, opts.dir)
            const corpus = scanMultiCorpus(roots)
            out.ok({
              rootCount: roots.length,
              fileCount: corpus.fileCount,
              mode: corpus.mode,
              roots,
              capabilitySignals: corpus.capabilitySignals,
            })
            return
          }
          if (opts.log) {
            const arts = listGeneratedArtifacts(store)
            out.ok({
              artifacts: arts.map((a) => ({ nodeId: a.nodeId, kinds: a.kinds, paths: a.paths, applied: a.applied })),
            })
            return
          }

          const targets = opts.auto
            ? store.getNodesByStatus('backlog')
            : name
              ? [store.getNodeById(name)].filter((n): n is GraphNode => n !== null)
              : []
          if (targets.length === 0) {
            out.err('INVALID_INPUT', 'Nenhum node alvo. Use `scaffold <nodeId>`, `--auto`, ou `--log`.')
            return
          }

          if (opts.apply) {
            if (opts.creative || opts.decide) {
              const mc = buildModelClient(store)
              if (opts.creative && !mc) {
                out.err(
                  'AUTH_REQUIRED',
                  'Borda criativa requer login (agf login). Rode sem --creative para determinístico.',
                )
                return
              }
              const ledger = new TokenLedger()
              const validate = opts.validate ? buildValidator(store) : undefined
              let made = 0
              let rejected = 0
              for (const n of targets) {
                const creative: CreativeGenerator | undefined =
                  opts.creative && mc
                    ? async (prompt) => {
                        const res = await mc.client.run('implement', prompt, undefined, undefined, 'high')
                        ledger.recordCall(n.id, {
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
                      }
                    : undefined
                const decide: ScaffoldDecider | undefined =
                  opts.decide && mc
                    ? async (prompt) => {
                        const res = await mc.client.run('classify', prompt, undefined, undefined, 'minimal')
                        ledger.recordCall(n.id, {
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
                      }
                    : undefined
                const r = await coupleNode(store, toCoupleNode(n), {
                  apply: true,
                  workspaceDir: opts.dir,
                  creative,
                  decide,
                  validate,
                })
                if (r.validated === false) {
                  rejected++
                  progress(`✗ ${n.id} → mutação rejeitada (não passou nos testes; revertida)`)
                  continue
                }
                if (!r.skipped) {
                  made++
                  const mark = r.kinds.includes('creative') ? ' (criativo 🧬)' : ''
                  progress(`✓ ${n.id} → ${r.kinds.join('+')}${mark}`)
                }
              }
              await flushHooks(store)
              if (ledger.entries().length > 0) {
                // persistLedger já grava a economia (cache + levers) na mesma costura.
                persistLedger(store.getDb(), ledger, {
                  sessionId: `scaffold_${projectId(store)}`,
                  provider: mc?.providerId ?? 'copilot',
                })
              }
              if (opts.validate && (made > 0 || rejected > 0)) {
                const learning = new SqliteLearningStore(store)
                const now = Date.now()
                for (const n of targets) {
                  const check = await coupleNode(store, toCoupleNode(n), { apply: false, workspaceDir: opts.dir })
                  if (!check.skipped) {
                    learning.appendRecord({
                      agentId: 'scaffold-coupler',
                      nodeId: n.id,
                      harnessDelta: 0,
                      acPassed: !check.files || check.files.length > 0,
                      cycleTimeMs: 0,
                      ts: now,
                    })
                  }
                }
              }
              out.ok({ applied: made, rejected, hint: 'Gasto criativo em `metrics`; reuso futuro = 0 token.' })
              return
            }

            let applied = 0
            const produced: { nodeId: string; kinds: string[]; paths: string[] }[] = []
            for (const n of targets) {
              await emitTaskHook(store, 'scaffold:requested', { nodeId: n.id, apply: true, workspaceDir: opts.dir })
            }
            await flushHooks(store)
            const arts = listGeneratedArtifacts(store)
            for (const n of targets) {
              const art = arts.find((a) => a.nodeId === n.id)
              if (art) {
                applied++
                produced.push({ nodeId: n.id, kinds: art.kinds, paths: art.paths })
                progress(`✓ ${n.id} → ${art.kinds.join('+')} (${art.paths.length} arquivo(s))`)
              }
            }
            out.ok({ applied, produced, hint: 'Reuso futuro = 0 token.' })
            return
          }

          let previews = 0
          const previewResults: {
            nodeId: string
            kinds: string[]
            files: string[]
            tokensSaved: number
            uncovered: string[]
            reason?: string
          }[] = []
          for (const n of targets) {
            const result = await coupleNode(store, toCoupleNode(n), { apply: false, workspaceDir: opts.dir })
            if (result.skipped) {
              if (!opts.auto) progress(`${n.id}: sem scaffold determinístico (${result.reason}).`)
              previewResults.push({
                nodeId: n.id,
                kinds: [],
                files: [],
                tokensSaved: 0,
                uncovered: [],
                reason: result.reason,
              })
              continue
            }
            previews++
            previewResults.push({
              nodeId: n.id,
              kinds: result.kinds,
              files: (result.files as Array<{ path?: string } | string>).map((f) =>
                typeof f === 'string' ? f : (f.path ?? ''),
              ),
              tokensSaved: result.tokensSaved,
              uncovered: result.uncovered,
            })
            progress(
              `${n.id} → ${result.kinds.join('+')} geraria ${result.files.length} arquivo(s); ~${result.tokensSaved} tokens evitados`,
            )
            if (result.uncovered.length > 0)
              progress(`   ⚠ não coberto pelo corpus: ${result.uncovered.join(', ')} (borda criativa)`)
          }
          out.ok({ previews, results: previewResults, hint: 'Use --apply para gerar e persistir.' })
        } catch (err) {
          out.err('SCAFFOLD_FAILED', err instanceof Error ? err.message : String(err))
        } finally {
          await flushHooks(store)
          store.close()
        }
      },
    )
}
