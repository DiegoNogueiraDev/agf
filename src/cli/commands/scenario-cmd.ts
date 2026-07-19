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

/** Builds the `agf scenario` CLI command (Commander definition). */
export function scenarioCommand(): Command {
  return new Command('scenario')
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
