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
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { ScenarioRunner } from '../../core/observability/scenario-runner.js'
import { buildBuiltinScenarios } from '../../core/observability/builtin-scenarios.js'

/** Builds the `agf scenario` CLI command (Commander definition). */
export function scenarioCommand(): Command {
  return new Command('scenario')
    .description('Roda a suíte de self-check ScenarioRunner (mutation/property testing, DB real em memória)')
    .option('--name <name>', 'Roda apenas o cenário com este nome exato')
    .action((opts: { name?: string }) => {
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

      out.ok({ results, passed, failed })
    })
}
