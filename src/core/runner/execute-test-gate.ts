/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Execution-grounded test gate: resolve the target project's test runner (any
 * language), run it, and emit a deterministic receipt of the run. This is the
 * single place `agf done`, `agf submit`, and `agf check --tests` run tests, so
 * the "tests actually pass" guarantee is one DRY implementation rather than a
 * vitest string copied across commands.
 *
 * The receipt (canonical hash of the run descriptor) is what lets provenance
 * promote a node to `validated` only against a real test run — see
 * test-receipt-store.ts and provenance/tier-promotion.ts.
 */

import { spawnSync } from 'node:child_process'
import { resolveTestCommandForFiles, withTestFiles } from './resolve-test-command.js'
import { hashNodeCanonical } from '../provenance/canonical-hasher.js'

export interface TestGateResult {
  /** False when no test runner could be detected for the target stack. */
  ran: boolean
  /** True when the suite passed (or there was nothing to run). */
  passed: boolean
  runner: string | null
  exitCode: number | null
  /** Deterministic hash of the run descriptor; null when nothing ran. */
  receipt: string | null
  /** Tail of stdout+stderr, only on failure. */
  output?: string
}

/**
 * Run the resolved test gate for `dir`. `explicit` overrides runner detection
 * (e.g. --test-cmd). When no runner is detected, returns ran=false / passed=true
 * (a project with no tests does not fail the gate; strict mode blocks that).
 */
export function runResolvedTestGate(
  dir: string,
  testFiles: string[],
  explicit?: string | null,
  opts: { timeoutMs?: number } = {},
): TestGateResult {
  const inference = resolveTestCommandForFiles(dir, testFiles, { explicit })
  if (!inference) {
    return { ran: false, passed: true, runner: null, exitCode: null, receipt: null }
  }
  const { resolved, cwd, testFiles: relativeTestFiles } = inference

  const { cmd, args } = withTestFiles(resolved, relativeTestFiles)
  // 64 MB buffer prevents false TESTS_FAILED on verbose output from large suites
  const run = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  })

  // Estouro de teto NÃO é reprovação nem aprovação: é ausência de resultado.
  // Devolver passed:false aqui seria inventar uma falha do código sob teste;
  // devolver passed:true seria aprovar por cansaço. `ran:false` diz a verdade
  // e deixa cada chamador decidir (o gate do done bloqueia, o verify-ac
  // responde 'não sei').
  if (run.error && (run.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { ran: false, passed: false, runner: resolved.runner, exitCode: null, receipt: null, output: 'timeout' }
  }

  const exitCode = run.status ?? 1
  const passed = exitCode === 0
  const receipt = hashNodeCanonical({ runner: resolved.runner, cmd, args, exitCode })
  const output = passed
    ? undefined
    : (run.stdout?.toString('utf-8') ?? '').slice(-500) + (run.stderr?.toString('utf-8') ?? '').slice(-500)

  return { ran: true, passed, runner: resolved.runner, exitCode, receipt, output }
}
