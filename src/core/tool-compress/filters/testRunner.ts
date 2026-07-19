/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

/**
 * test-runner — colapsa a torrente de PASS de saída de testes (vitest/jest/pytest)
 * preservando TODA linha de falha e o sumário final. O agente só precisa ler o que
 * quebrou, não as centenas de checks verdes. Determinístico, 0 token.
 */
import { TEST_RUNNER_MAX_KEEP } from '../constants.js'

const RE_VITEST_PASS = /^\s*[✓√]\s/
const RE_VITEST_FAIL = /^\s*[×✗❯]\s/
const RE_JEST_PASS = /^\s*PASS\s/
const RE_JEST_FAIL = /^\s*FAIL\s/
const RE_JEST_BULLET = /^\s*[●✕]\s/
const RE_PYTEST_FAILED = /^(FAILED|ERROR)\b/
const RE_PYTEST_SUMMARY = /^=+.*\b(passed|failed|error|skipped)\b.*=+\s*$/i
const RE_FAIL_DETAIL = /(AssertionError|→|[Ee]xpected|[Rr]eceived|toBe|toEqual|Difference|Error:|^\s+at\s|^\s*\|)/
// `Tests` deve ser seguido de `:`/espaço (sumário), nunca `/` (path pytest `tests/…`).
const RE_SUMMARY = /^\s*(Test Files|Tests[:\s]|Snapshots|Duration\s|Start at|Time:|Ran all test)/i
const RE_PYTEST_PROGRESS = /\.py\s+[.FEsxX]+/
// go test
const RE_GO_FAIL = /^\s*(--- FAIL:|FAIL\s+\S|panic:)/
const RE_GO_PASS = /^\s*(--- PASS:|=== (RUN|PAUSE|CONT)|ok\s+\S)/
// cargo test (Rust)
const RE_CARGO_FAIL = /^test \S.* \.\.\. FAILED$/
const RE_CARGO_PASS = /^test \S.* \.\.\. (ok|ignored)$/
// sumário genérico: cargo (`test result:`), rspec/minitest (`N examples, M failures`)
const RE_TEST_SUMMARY = /^(test result:|\d+ (examples?|tests?|runs?|assertions?)[,: ])/i
// sinais FORTES de falha (go/cargo/rspec) que podem aparecer fora do bloco de
// falha (separados por linhas em branco) — mantidos SEMPRE p/ não perder o motivo.
const RE_STRONG_FAIL = /panicked|assertion failed|^---- .*stdout ----|^thread '|Failure\/Error|^\s*expected:|^\s*got:/

/** Extrai o segmento de status pytest (após o último `.py`) p/ achar F/E. */
function pytestStatusHasFailure(line: string): boolean {
  const idx = line.lastIndexOf('.py')
  if (idx === -1) return false
  return /[FE]/.test(line.slice(idx + 3))
}

/** Collapse passing test output (vitest/jest/pytest/go test/cargo) keeping all failure lines and the final summary; reduces green-pass noise for the agent. */
export function testRunner(input: string): string {
  const lines = input.split('\n')
  if (lines.length === 0) return input

  const kept: string[] = []
  let passes = 0
  let inFailBlock = false

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim() === '') {
      inFailBlock = false
      continue
    }

    // Falhas e seus blocos de detalhe SEMPRE sobrevivem.
    if (
      RE_VITEST_FAIL.test(line) ||
      RE_JEST_FAIL.test(line) ||
      RE_JEST_BULLET.test(line) ||
      RE_PYTEST_FAILED.test(line) ||
      RE_GO_FAIL.test(line) ||
      RE_CARGO_FAIL.test(line)
    ) {
      if (kept.length < TEST_RUNNER_MAX_KEEP) kept.push(line)
      inFailBlock = true
      continue
    }
    if (inFailBlock && RE_FAIL_DETAIL.test(line)) {
      if (kept.length < TEST_RUNNER_MAX_KEEP) kept.push(line)
      continue
    }
    // Sinal forte de falha sobrevive mesmo fora do bloco (panic/assertion/rspec).
    if (RE_STRONG_FAIL.test(line)) {
      if (kept.length < TEST_RUNNER_MAX_KEEP) kept.push(line)
      inFailBlock = true
      continue
    }

    // Sumário final SEMPRE sobrevive.
    if (RE_SUMMARY.test(line) || RE_PYTEST_SUMMARY.test(line) || RE_TEST_SUMMARY.test(line)) {
      kept.push(line.trim())
      inFailBlock = false
      continue
    }

    // Progresso pytest: com F/E → falha (mantém); só pontos → conta como passe.
    if (RE_PYTEST_PROGRESS.test(line)) {
      if (pytestStatusHasFailure(line)) {
        kept.push(line)
        inFailBlock = true
      } else {
        passes++
        inFailBlock = false
      }
      continue
    }

    // Torrente de passes → contada e descartada (vitest/jest/go/cargo).
    if (RE_VITEST_PASS.test(line) || RE_JEST_PASS.test(line) || RE_GO_PASS.test(line) || RE_CARGO_PASS.test(line)) {
      passes++
      inFailBlock = false
      continue
    }

    // Linha não classificada: mantém só se dentro de um bloco de falha (contexto).
    if (inFailBlock && kept.length < TEST_RUNNER_MAX_KEEP) kept.push(line)
  }

  if (passes > 0) kept.unshift(`✓ ${passes} passando (colapsados)`)
  const out = kept.join('\n')
  return out.length > 0 && out.length < input.length ? out : input
}

testRunner.filterName = 'test-runner'
