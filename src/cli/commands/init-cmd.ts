/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { runInit, runUpdate } from '../../mcp/init-project.js'
import { runInstallNeural } from '../../core/install-neural/install-neural.js'
import { buildRealNeuralDeps } from '../../core/install-neural/real-deps.js'
import { isOnnxAvailable } from '../../core/rag/onnx-embeddings.js'
import { runDoctor } from '../../core/doctor/doctor-runner.js'
import type { CheckResult } from '../../core/doctor/doctor-types.js'
import { getErrorMessage } from '../../core/utils/errors.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { runAtomicWrites } from '../../core/atomic-files/runner.js'
import type { AtomicFileMode } from '../../core/atomic-files/types.js'
import { openStoreOrFail } from '../open-store.js'
import { STORE_DIR as GRAPH_STORE_DIR, DB_FILE } from '../../core/utils/constants.js'
import { startDashboardServer } from '../../api/app-factory.js'
import { openBrowser, shouldSkipAutoOpen } from '../../core/web/open-browser.js'
import { installPreCommitHook } from '../../core/git/pre-commit-hook.js'
import { installBashCompressHook } from '../../core/hooks/bash-compress-hook.js'
import { installFileSizeGuardHook } from '../../core/hooks/file-size-guard-hook.js'
import { CLI_PROVIDER_SETTING } from '../../core/cli-provider/cli-init-selector.js'
import { detectActiveCLI } from '../../core/cli-provider/cli-provider.js'
import { getConfigFilesForCLI } from '../../core/cli-provider/config-conditional.js'
import { AgentSourceSchema } from '../../core/hooks/config-loader.js'
import { scaffoldGuidedStarter } from '../../core/init/scaffold-guided-starter.js'
import { scaffoldProject } from '../../core/init/scaffold.js'
import { createDemoSandbox, type DemoSandbox } from '../../core/init/demo-sandbox.js'

const log = createLogger({ layer: 'cli', source: 'init.ts' })

const LEVEL_ICON: Record<string, string> = { ok: '✓', warning: '⚠', error: '✗' }

// ── Orchestration types (exported for tests) ──────────────────────────────────

export interface InitOrchestrationDeps {
  isDbInitialized: (dir: string) => boolean
  runSetup: (dir: string, isNew: boolean, force: boolean) => Promise<void>
  /** Minimal, non-invasive setup: create the graph DB + gitignore only, zero context. */
  runGraphOnlySetup: (dir: string) => Promise<void>
  atomicWrites: (tag: AtomicFileMode) => Promise<Map<string, { status: string }>>
  isNeuralReady: () => Promise<boolean>
  installNeural: (opts: { modelsDir: string }) => Promise<'ready' | 'failed'>
  runDoctor: (
    dir: string,
  ) => Promise<{ passed: boolean; summary: { ok: number; warning: number; error: number }; checks: CheckResult[] }>
  /** Start the server; resolves with the real URL once listening. */
  startServer: (port: number) => Promise<string | undefined>
  /** Open a URL in the default browser (optional — omit to skip auto-open). */
  openInBrowser?: (url: string) => Promise<void>
  out: (msg: string) => void
  /** Detecta e configura qual CLI o usuário está usando. */
  detectCli: (dir: string) => Promise<void>
}

export interface InitOrchestrationOptions {
  dir: string
  skipNeural: boolean
  noServe: boolean
  port: number
  /** Skip auto-opening the browser after the server starts. */
  noOpen?: boolean
  /** Força re-sincronização dos blocos gerenciados mesmo em projeto já existente. */
  force?: boolean
  /** Cria SÓ o grafo (workflow-graph/ + gitignore), sem injetar contexto — p/ repos de terceiros. */
  graphOnly?: boolean
}

// ── Core orchestration (pure, testable via DI) ────────────────────────────────

export async function runInitOrchestration(
  opts: InitOrchestrationOptions,
  deps: InitOrchestrationDeps,
): Promise<{ success: boolean }> {
  const { dir, skipNeural, noServe, port, noOpen } = opts
  const { out } = deps
  const force = opts.force ?? false

  // graph-only: pointar o agf a um repo de TERCEIROS sem reescrever AGENTS.md/
  // .claude/.cursor/etc. Cria só o grafo + gitignore e retorna — nenhuma das fases
  // de contexto/neural/serve roda. É o modo não-invasivo de portabilidade.
  if (opts.graphOnly) {
    out(`\n── graph-only ${'─'.repeat(39)}`)
    await deps.runGraphOnlySetup(dir)
    out('  ✓ Grafo criado (workflow-graph/) — sem tocar arquivos de contexto')
    return { success: true }
  }

  const isNew = !deps.isDbInitialized(dir)
  // --force trata o projeto como update: reescreve blocos gerenciados mesmo que
  // os marcadores já existam (modo 'init' do writer-markdown faria noop).
  const tag = isNew && !force ? 'init' : 'update'

  // ── Fase 1: setup (PRIMEIRO — cria o banco antes de qualquer leitura) ────
  out(`\n── 1/4 setup ${'─'.repeat(40)}`)
  await deps.runSetup(dir, isNew, force)

  // ── Fase 0: detecção de CLI (DEPOIS do setup — precisa do store aberto) ──
  out(`\n── 0/4 CLI ${'─'.repeat(41)}`)
  await deps.detectCli(dir)
  const atomicReport = await deps.atomicWrites(tag as AtomicFileMode)
  for (const [fileId, result] of atomicReport) {
    out(`  ${result.status.padEnd(10)} ${fileId}`)
  }
  out(`  ✓ Projeto ${isNew ? 'inicializado' : 'atualizado'}`)

  // ── Fase 2: neural ─────────────────────────────────────────────────────────
  if (!skipNeural) {
    out(`\n── 2/4 neural ${'─'.repeat(39)}`)
    const alreadyReady = await deps.isNeuralReady()
    if (alreadyReady) {
      out('  ✓ ONNX já instalado — pulando')
    } else {
      out('  Instalando ONNX runtime + modelo (~30s)...')
      const modelsDir = join(dir, 'workflow-graph', 'models')
      const status = await deps.installNeural({ modelsDir })
      if (status === 'ready') {
        out('  ✓ Neural embeddings prontos')
      } else {
        out('  ⚠ Neural install falhou — continuando sem embeddings neurais')
      }
    }
  }

  // ── Fase 3: doctor ─────────────────────────────────────────────────────────
  out(`\n── 3/4 doctor ${'─'.repeat(39)}`)
  const report = await deps.runDoctor(dir)
  for (const check of report.checks) {
    const icon = LEVEL_ICON[check.level] ?? '?'
    out(`  ${icon} ${check.message}`)
    if ('suggestion' in check && check.suggestion) {
      out(`      ${check.suggestion}`)
    }
  }
  out(`  Summary: ${report.summary.ok} ok, ${report.summary.warning} warnings, ${report.summary.error} errors`)

  if (!report.passed) {
    out('\n  ✗ Erros críticos detectados — corrija antes de iniciar o servidor.')
    return { success: false }
  }

  // ── Fase 4: serve ──────────────────────────────────────────────────────────
  if (!noServe) {
    out(`\n── 4/4 serve ${'─'.repeat(40)}`)
    const serverUrl = await deps.startServer(port)
    const url = serverUrl ?? `http://localhost:${port}`
    out(`  Dashboard → ${url}`)
    if (!noOpen) {
      await deps.openInBrowser?.(url)
    }
  }

  return { success: true }
}

// ── Real deps wired for CLI ───────────────────────────────────────────────────

async function detectCli(dir: string): Promise<void> {
  const store = openStoreOrFail(dir)
  try {
    const stored = store.getProjectSetting(CLI_PROVIDER_SETTING)
    const detection = detectActiveCLI(undefined, process.env)
    let cliSource: string
    if (stored) {
      cliSource = stored
      const label = detection?.label ?? stored
      process.stderr.write(`  ✓ CLI configurado: ${label}\n`)
    } else if (detection) {
      cliSource = detection.source
      store.setProjectSetting(CLI_PROVIDER_SETTING, detection.source)
      process.stderr.write(`  ✓ CLI detectado: ${detection.label}\n`)
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const answer = await new Promise<string>((resolve) => {
        rl.question('  Qual CLI você está usando? (opencode/codex/claude/copilot/mcp-graph): ', resolve)
      })
      rl.close()
      cliSource = answer.trim().toLowerCase()
      if (['opencode', 'codex', 'claude', 'copilot', 'mcp-graph'].includes(cliSource)) {
        store.setProjectSetting(CLI_PROVIDER_SETTING, cliSource)
        process.stderr.write(`  ✓ CLI configurado: ${cliSource}\n`)
      } else {
        process.stderr.write(`  ⚠ CLI não reconhecido — usando config padrão\n`)
        cliSource = 'unknown'
      }
    }
    const parsedSource = AgentSourceSchema.safeParse(cliSource)
    const configFiles = getConfigFilesForCLI(parsedSource.success ? parsedSource.data : 'unknown')
    process.stderr.write(`  ├ Configs: ${configFiles.join(', ')}\n`)
  } finally {
    store.close()
  }
}

/**
 * Non-invasive graph bootstrap for a foreign repo: materialize workflow-graph/ +
 * gitignore, then create graph.db by opening the store once. Writes ZERO context
 * files (no AGENTS.md/.claude/.cursor/PRD). Exported so it is directly testable.
 */
export async function runGraphOnlySetup(dir: string): Promise<void> {
  scaffoldProject(dir, { graphOnly: true })
  const store = openStoreOrFail(dir)
  try {
    // A migrated DB is not yet a usable graph: without a projects row, any command
    // that materializes the graph (gaps, harness) throws GraphNotInitializedError.
    // initProject() inserts it — DB-only, still zero context files touched.
    store.initProject()
  } finally {
    store.close()
  }
}

/**
 * When `--demo` is set, ignore the given `dir` and point init at a fresh
 * ephemeral sandbox (`~/.mcp-graph/demos/<stamp>/`) instead — lets a user try
 * `agf init` without touching a real project. Cleanup is opt-in (the caller
 * gets `sandbox.cleanup()` back); we never auto-remove it so the user can keep
 * exploring after the CLI exits.
 */
export function resolveDemoDir(opts: { demo: boolean; dir: string }): { dir: string; sandbox?: DemoSandbox } {
  if (!opts.demo) return { dir: opts.dir }
  const sandbox = createDemoSandbox()
  return { dir: sandbox.path, sandbox }
}

/**
 * True only when the graph DB exists AND already has a project row. File
 * existence alone is not a reliable signal: session:start hooks (see
 * registerSessionResumeDetector) open the store as a best-effort side effect
 * on every CLI invocation, migrating the schema before `init`'s own action
 * runs. Without this check, that side effect makes a genuinely fresh init
 * look like an update — and `runUpdate` never calls `initProject()`, leaving
 * the graph permanently uninitialized (node_a0656372d551).
 */
export function isProjectInitialized(dir: string): boolean {
  if (!existsSync(join(dir, GRAPH_STORE_DIR, DB_FILE))) return false
  const store = openStoreOrFail(dir)
  try {
    return store.getProject() !== null
  } finally {
    store.close()
  }
}

function buildRealDeps(out: (msg: string) => void): InitOrchestrationDeps {
  return {
    isDbInitialized: (d) => isProjectInitialized(d),
    runGraphOnlySetup,
    runSetup: async (d, isNew, force) => {
      // DB ausente ⇒ runInit (runUpdate lança GraphNotInitializedError sem DB).
      // Os geradores de contexto reescrevem por marcador em ambos os caminhos;
      // `force` faz o caminho update reescrever mesmo quando o conteúdo é igual.
      if (isNew) await runInit(d)
      else await runUpdate(d, { force })
    },
    atomicWrites: (tag) => runAtomicWrites(tag),
    isNeuralReady: isOnnxAvailable,
    installNeural: async ({ modelsDir }) => {
      const result = await runInstallNeural({ dryRun: false, modelsDir }, buildRealNeuralDeps())
      return result.status === 'ready' ? 'ready' : 'failed'
    },
    runDoctor,
    startServer: async (port) => {
      const store = await openStoreOrFail(process.cwd(), { requireExisting: true })
      // Serve the new SPA dashboard (Graph + Economy) + /api/v1, not the legacy
      // string-HTML progress server.
      const handle = await startDashboardServer(store, { port, host: '127.0.0.1' })
      return handle.url
    },
    openInBrowser: async (url) => {
      // CI/SSH/piped-output: no local display to open, or nobody watching —
      // skip the attempt entirely instead of a doomed-to-fail spawn.
      if (shouldSkipAutoOpen({ env: process.env, isTty: Boolean(process.stdout.isTTY) })) return
      openBrowser(url)
    },
    out,
    detectCli,
  }
}

// ── CLI command ───────────────────────────────────────────────────────────────

function progress(msg: string): void {
  process.stderr.write(msg + '\n')
}

/** initCommand — initializes (or re-syncs) the project and starts the server. */
export function initCommand(): Command {
  return new Command('init')
    .description('Initialize agf: setup → neural → doctor → serve')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('-n, --name <name>', 'Project name (first init only)')
    .option('-p, --port <port>', 'Port for the dashboard server', '3000')
    .option('--skip-neural', 'Skip ONNX neural embeddings installation', false)
    .option('--no-serve', 'Run setup and doctor only — do not start the server')
    .option('--no-open', 'Do not auto-open the browser after the server starts')
    .option('--force', 'Re-sync managed context blocks even if they already exist/are unchanged', false)
    .option('--guided', 'After init, scaffold a starter epic + atomic task on an empty graph', false)
    .option(
      '--graph-only',
      'Create ONLY the graph (workflow-graph/ + gitignore) — no context files, hooks, or server. For third-party repos.',
      false,
    )
    .option(
      '--demo',
      'Try agf risk-free: scaffolds a throwaway project under ~/.mcp-graph/demos/ instead of --dir (manual cleanup)',
      false,
    )
    .action(
      async (opts: {
        dir: string
        name?: string
        port: string
        skipNeural: boolean
        serve: boolean
        open: boolean
        force: boolean
        guided: boolean
        graphOnly: boolean
        demo: boolean
      }) => {
        const out = createCliOutput('init')
        const { dir: resolvedDir, sandbox } = resolveDemoDir({ demo: opts.demo, dir: path.resolve(opts.dir) })
        const dir = resolvedDir
        const port = parseInt(opts.port, 10)

        if (isNaN(port) || port < 1 || port > 65535) {
          log.error('Invalid port number', { port: opts.port })
          out.err('INVALID_PORT', `Invalid port number: ${opts.port}`)
          return
        }

        // graph-only never serves, and skips every context/hook installer below.
        const noServe = opts.graphOnly || opts.serve === false

        progress(opts.graphOnly ? 'agf init --graph-only' : 'agf init')

        try {
          const deps = buildRealDeps(progress)
          const { success } = await runInitOrchestration(
            {
              dir,
              skipNeural: opts.skipNeural,
              noServe,
              port,
              noOpen: opts.open === false,
              force: opts.force,
              graphOnly: opts.graphOnly,
            },
            deps,
          )

          // graph-only stops here: on a third-party repo we install NO git/.claude
          // hooks — those mutate tracked/config files the repo owner didn't ask for.
          if (opts.graphOnly) {
            out.ok({ success, graphOnly: true, serveStarted: false })
            return
          }

          // Install git pre-commit hook (idempotent; fail-open if .git absent)
          try {
            installPreCommitHook(dir)
          } catch {
            // Not a git repo or hooks dir missing — silently skip
          }

          // Install Bash compression PostToolUse hook into .claude/settings.json (idempotent)
          try {
            installBashCompressHook(dir)
          } catch {
            // Non-fatal — project may not have .claude dir writable yet
          }

          // Install file-size guard PreToolUse hook for Claude Code (idempotent)
          installFileSizeGuardHook(dir)

          if (!success) {
            out.err('INIT_FAILED', 'Erros críticos detectados — corrija antes de iniciar o servidor.')
          } else {
            let guided: { added: boolean; epicId?: string; taskId?: string } | undefined
            if (opts.guided) {
              const store = openStoreOrFail(dir, { requireExisting: true })
              try {
                guided = scaffoldGuidedStarter(store)
              } finally {
                store.close()
              }
            }
            out.ok({
              success: true,
              serveStarted: !noServe,
              port: noServe ? undefined : port,
              ...(guided !== undefined ? { guided } : {}),
              ...(sandbox ? { demoPath: sandbox.path } : {}),
              nextSteps: [
                ...(guided?.added ? ['Sample epic + task created — run `agf start` to begin TDD'] : []),
                ...(sandbox ? [`Demo project: ${sandbox.path} (rm -rf when done — not auto-cleaned)`] : []),
                'Entregue: agf deliver "<sua tarefa>"',
                'Economia: agf savings · Painel: agf status',
                'Todos os comandos: agf help',
              ],
            })
          }
        } catch (error) {
          log.error('Init failed', { error: getErrorMessage(error) })
          out.err('INIT_ERROR', getErrorMessage(error))
        }
      },
    )
}
