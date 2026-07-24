/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * scenario-cmd — agf scenario CLI command.
 *
 * WHY: Exposes ScenarioRunner (scenario-runner.ts) — real-:memory:-SQLite
 * mutation/property testing (DeMillo, Lipton & Sayward 1978) — which had no
 * surface. Runs the built-in self-check suite (builtin-scenarios.ts) and
 * reports pass/fail per scenario.
 *
 * Composes with: scenario-runner.ts + builtin-scenarios.ts (core, pure —
 * no project store involved, each scenario owns its own :memory: DB).
 *
 * `--node <id>` (node_a0e28320fe6b) PERSISTE o veredito agregado ligado a uma
 * task de superfície, para que `check`/`done` tenham evidência real para ler —
 * sem isso o run morre com o processo e o gate só poderia adivinhar. Opt-in:
 * sem a flag o comportamento é idêntico ao anterior e nenhum store é aberto.
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { ScenarioRunner } from '../../core/observability/scenario-runner.js'
import { buildBuiltinScenarios } from '../../core/observability/builtin-scenarios.js'
import { recordScenarioVerdict } from '../../core/observability/scenario-verdict-store.js'
import { runBrowserScenario } from '../../core/observability/scenario-browser-run.js'
import { createBrowserActions } from '../../plugins/browser/actions/index.js'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** Builds the `agf scenario` CLI command (Commander definition). */
export function scenarioCommand(): Command {
  return (
    new Command('scenario')
      // Both this command and the `browser` subcommand declare `--node`. Without
      // positional options Commander binds the subcommand's flag to the parent and
      // then reports it as missing — silently, with a message that points nowhere.
      .enablePositionalOptions()
      .description('Roda a suíte de self-check ScenarioRunner (mutation/property testing, DB real em memória)')
      .option('--name <name>', 'Roda apenas o cenário com este nome exato')
      .option('--node <id>', 'Persiste o veredito ligado a esta task de superfície (gate de surface-proof)')
      .option('-d, --dir <dir>', 'Project root directory', process.cwd())
      .action((opts: { name?: string; node?: string; dir: string }) => {
        const out = createCliOutput('scenario')
        const scenarios = buildBuiltinScenarios()
        const selected = opts.name ? scenarios.filter((s) => s.name === opts.name) : scenarios

        if (opts.name && selected.length === 0) {
          out.err('NOT_FOUND', `Cenário não encontrado: ${opts.name}`)
          return
        }

        const results = new ScenarioRunner().runAll(selected)
        const passed = results.filter((r) => r.passed).length
        const failed = results.length - passed

        const persisted = opts.node ? persistVerdict(opts.dir, opts.node, failed) : false

        out.ok({ results, passed, failed, ...(opts.node ? { nodeId: opts.node, persisted } : {}) })
      })
      .addCommand(browserSubcommand())
  )
}

/**
 * `agf scenario browser` — drives a real browser through a scenario and records the
 * oracle's verdict for a surface task.
 *
 * Added ALONGSIDE the self-check run rather than folded into it: the two answer
 * different questions (is agf internally consistent vs. does this surface actually
 * operate), and merging them would let one mask the other.
 */
function browserSubcommand(): Command {
  return new Command('browser')
    .description('Roda um cenário de browser e grava o veredito do oráculo para uma task de superfície')
    .requiredOption('--node <id>', 'Task de superfície que este veredito prova')
    .requiredOption('--plan <path>', 'Arquivo com o cenário em linguagem natural (uma ação por linha)')
    .requiredOption('--graph-dir <dir>', 'Diretório do grafo DESCARTÁVEL que o alvo serve (nunca o do projeto)')
    .option('--daemon <url>', 'URL do daemon CDP', 'ws://127.0.0.1:9222')
    .option('--allow <hosts...>', 'Hosts permitidos para navegação', [])
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .action(async (opts: BrowserScenarioOptions) => {
      const out = createCliOutput('scenario.browser')
      if (!existsSync(opts.plan)) {
        out.err('NOT_FOUND', `Arquivo de cenário não encontrado: ${opts.plan}`)
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      // The CDP socket keeps the event loop alive, so it is released in the SAME
      // finally as the store — including on the refusal paths, where the handle was
      // still opened. Without this the command does its work, writes the verdict and
      // never exits, which a script reads as a hang.
      const actions = createBrowserActions({ daemonUrl: opts.daemon, allowedDomains: opts.allow })
      try {
        const result = await runBrowserScenario({
          db: store.getDb(),
          nodeId: opts.node,
          nl: readFileSync(opts.plan, 'utf8'),
          actions,
          projectDir: opts.dir,
          graphDir: opts.graphDir,
          scenarioId: basename(opts.plan),
        })
        if (!result.ok) {
          out.err(result.code, result.error)
          return
        }
        out.ok({ nodeId: opts.node, verdict: result.verdict.verdict, corroboration: result.verdict.corroboration })
      } finally {
        actions.close()
        store.close()
      }
    })
}

interface BrowserScenarioOptions {
  node: string
  plan: string
  graphDir: string
  daemon: string
  allow: string[]
  dir: string
}

/**
 * Grava o veredito agregado do run para a task de superfície. Só é `passed`
 * quando NENHUM cenário falhou — aprovação parcial não é aprovação.
 */
function persistVerdict(dir: string, nodeId: string, failed: number): boolean {
  const allPassed = failed === 0
  const store = openStoreOrFail(dir, { requireExisting: true })
  try {
    recordScenarioVerdict(store.getDb(), {
      nodeId,
      passed: allPassed,
      scenarioId: 'builtin-suite',
      ranAt: Date.now(),
      ...(allPassed ? {} : { detail: `${failed} cenário(s) falharam` }),
    })
    return true
  } finally {
    store.close()
  }
}
