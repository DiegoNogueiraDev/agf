/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Oráculos de correção do eval (estilo SWE-bench): a verdade é o **test-suite do
 * próprio cenário** ficar verde após a edição do agente (FAIL_TO_PASS) — não o
 * que o modelo "acha" que fez. `testsGreen` é o oráculo primário; o `done` do DoD
 * (gate do autopilot) é a segunda condição (best-practice SWE). Injetável p/ testes.
 */
import { execSync } from 'node:child_process'

export interface TestRunResult {
  passed: boolean
  output: string
}

/** Roda um comando de teste num diretório. Injetável (testes passam um fake). */
export type TestRunner = (cmd: string, dir: string) => TestRunResult

/** Runner real: exit 0 = verde; captura stdout+stderr p/ diagnóstico. */
export const defaultTestRunner: TestRunner = (cmd: string, dir: string): TestRunResult => {
  try {
    const out = execSync(cmd, { cwd: dir, stdio: 'pipe', timeout: 120_000, encoding: 'utf8', windowsHide: true })
    return { passed: true, output: out }
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string }
    const output = `${String(e.stdout ?? '')}${String(e.stderr ?? '')}` || (e.message ?? 'erro')
    return { passed: false, output }
  }
}

/** Oráculo primário: o test-suite do cenário fica verde? (exit 0). */
export function testsGreen(dir: string, testCmd: string, run: TestRunner = defaultTestRunner): TestRunResult {
  return run(testCmd, dir)
}
