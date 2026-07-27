/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * verify-ac — repeatedly found ACs already satisfied by existing code,
 * discovered only by manual grep before implementing from scratch. Checks,
 * in priority order:
 *   1. A `--check` hint attached to the node (node.metadata.checkHint) — run
 *      it, exit code decides.
 *   2. Declared testFiles — run the resolved test gate (same runner `agf
 *      done`/`agf check` use), pass/fail decides.
 *   3. Otherwise, if the AC is testable-in-principle (scoreAcTestability's
 *      hasObservableOutcome — has a real action verb, not just filler), grep
 *      the codebase for key terms extracted from the AC text. A match means
 *      the behavior likely already exists; no match means it doesn't.
 *   4. A vague AC with none of the above is 'unclear' — there's nothing to
 *      derive a check from, so no verdict can be given either way.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import type { SqliteStore } from '../store/sqlite-store.js'
import { getNodeAcFromStore } from '../utils/ac-helpers.js'
import { scoreAcTestability, tokenize } from './ac-testability.js'
import { runResolvedTestGate } from '../runner/execute-test-gate.js'
import { missingFiles } from '../gaps/detect-phantom-done.js'

/** Teto de tempo do gate de teste. O caminho do checkHint já usava 10s; este é
 *  mais folgado porque uma suíte real é legitimamente mais lenta que um probe. */
const TEST_GATE_TIMEOUT_MS = 120_000

export type AcVerificationStatus = 'satisfied' | 'not_satisfied' | 'unclear'

export interface AcVerificationResult {
  status: AcVerificationStatus
  reason: string
}

/** Minimum token length to count as a "key term" worth grepping for. */
const MIN_KEY_TERM_LENGTH = 4

function grepCodebaseForTerms(dir: string, terms: string[]): boolean {
  const candidates = terms.filter((t) => t.length >= MIN_KEY_TERM_LENGTH).slice(0, 5)
  if (candidates.length === 0) return false

  for (const term of candidates) {
    const result = spawnSync('grep', ['-ril', '--include=*.ts', '-e', term, join_src(dir)], {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    if (result.status === 0 && (result.stdout ?? '').trim().length > 0) return true
  }
  return false
}

function join_src(dir: string): string {
  return `${dir}/src`
}

/** Verify whether a node's AC is already satisfied by existing code. `testCmd` overrides test-runner detection (mirrors `agf done --test-cmd`). */
export function verifyAc(
  store: SqliteStore,
  nodeId: string,
  dir: string,
  testCmd?: string,
  opts: { timeoutMs?: number } = {},
): AcVerificationResult {
  const node = store.getNodeById(nodeId)
  if (!node) return { status: 'not_satisfied', reason: 'node not found' }

  const checkHint = (node.metadata as { checkHint?: string } | undefined)?.checkHint
  if (checkHint) {
    const result = spawnSync(checkHint, { shell: true, cwd: dir, encoding: 'utf-8', timeout: 10_000 })
    return result.status === 0
      ? { status: 'satisfied', reason: `check hint passed: ${checkHint}` }
      : { status: 'not_satisfied', reason: `check hint failed (exit ${result.status}): ${checkHint}` }
  }

  if (node.testFiles && node.testFiles.length > 0) {
    // Existência física ANTES de rodar: um teste declarado que não está no disco
    // não reprova o runner — ele simplesmente não é coletado, e "nenhuma falha"
    // seria lido como aprovação. Como este comando existe para o builder decidir
    // NÃO implementar, esse falso 'satisfied' faz pular trabalho real. Mesma
    // triangulação física do gate PHANTOM_TESTFILE, reusando o mesmo helper.
    const absent = missingFiles(node.testFiles, (f) => existsSync(resolvePath(dir, f)))
    if (absent.length > 0) {
      return {
        status: 'not_satisfied',
        reason: `declared testFiles do not exist on disk: ${absent.join(', ')}`,
      }
    }

    const gate = runResolvedTestGate(dir, node.testFiles, testCmd, {
      timeoutMs: opts.timeoutMs ?? TEST_GATE_TIMEOUT_MS,
    })
    // `ran: false` significa que nenhum runner foi inferido — ausência de
    // execução, não aprovação. O gate devolve passed:true nesse caso por
    // desenho (um projeto sem testes não reprova o `done`), então quem
    // pergunta "já está pronto?" precisa ler `ran`, não só `passed`.
    if (!gate.ran) {
      const cause =
        gate.output === 'timeout'
          ? `test run exceeded ${opts.timeoutMs ?? TEST_GATE_TIMEOUT_MS}ms (timeout) — nothing was proven`
          : 'no test runner detected — nothing ran, so nothing is proven'
      return { status: 'unclear', reason: cause }
    }
    return gate.passed
      ? { status: 'satisfied', reason: 'declared testFiles pass' }
      : { status: 'not_satisfied', reason: 'declared testFiles fail' }
  }

  const acTexts = getNodeAcFromStore(store, nodeId)
  const acJoined = acTexts.join(' ')
  if (!acJoined.trim()) return { status: 'unclear', reason: 'no check hint and no testFiles (and no AC text)' }

  const scored = scoreAcTestability(acJoined)
  if (!scored.hasObservableOutcome) {
    return {
      status: 'unclear',
      reason: 'no check hint and no testFiles — AC has no observable outcome to derive a check from',
    }
  }

  const found = grepCodebaseForTerms(dir, tokenize(acJoined))
  return found
    ? { status: 'satisfied', reason: 'matching code found via grep on AC key terms' }
    : { status: 'not_satisfied', reason: 'no matching code found via grep on AC key terms' }
}
