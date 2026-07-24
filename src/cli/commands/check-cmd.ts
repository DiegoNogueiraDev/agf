/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { spawnSync } from 'node:child_process'
import { openStoreOrFail } from '../open-store.js'
import { surfaceProofState, surfaceProofPayload } from '../../core/observability/scenario-verdict-store.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { renewTaskClaim } from '../../core/planner/renew-task-claim.js'
import { checkTddAdherence } from '../../core/implementer/tdd-checker.js'
import { buildValidatorReport } from '../../core/validator/index.js'
import { recordDodFail, getConsecutiveDodFailCount } from '../../core/colony/auto-quarantine.js'
import {
  incrementGateAttempt,
  resetGateAttempts,
  buildEscalationApplyVia,
  MAX_GATE_ATTEMPTS,
} from '../../core/implementer/gate-attempt-tracker.js'
import { runMutationGate, realMutationGateDeps } from '../../core/quality/mutation-gate-runner.js'
import { runResolvedTestGate } from '../../core/runner/execute-test-gate.js'
import { recordTestReceipt } from '../../core/runner/test-receipt-store.js'
import { reinforceFromOutcome, type TaskOutcome } from '../../core/colony/outcome-reinforcement.js'
import { mmasDeposit } from '../../core/economy/mmas-pheromone.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'check-cmd.ts' })

/** Builds the `agf check` CLI command (Commander definition). */
export function checkCommand(): Command {
  log.info('check command registered')
  return new Command('check')
    .description('Roda Definition of Done + aderência TDD numa task (guardrail do BUILD)')
    .argument('<nodeId>', 'ID da task a verificar')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--mutation', 'Opt-in: roda mutation gate (aplica mutantes → roda teste → restaura) e anexa o relatório')
    .option('--source <file>', 'Arquivo-fonte a mutar (obrigatório com --mutation)')
    .option('--test <file>', 'Arquivo de teste a rodar (default: primeiro testFiles do nó)')
    .option('--threshold <n>', 'Kill-ratio mínimo do mutation gate (default 0.60)')
    .option('--tests', 'Opt-in: roda o gate de teste real (runner por linguagem) e grava um recibo verificável', false)
    .option('--test-cmd <cmd>', 'Comando de teste explícito p/ --tests (sobrepõe a detecção)')
    .option(
      '--red-first',
      'Confirma que um teste falhou (RED) antes da implementação passar (GREEN) — exigido por tdd_gate_pass quando o preset strict-tdd está ativo',
      false,
    )
    .action(
      (
        nodeId: string,
        opts: {
          dir: string
          mutation?: boolean
          source?: string
          test?: string
          threshold?: string
          tests?: boolean
          testCmd?: string
          redFirst?: boolean
        },
      ) => {
        const out = createCliOutput('check')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const doc = store.toGraphDocument()

          // NOT_FOUND only when the node truly doesn't exist. (Previously this
          // keyed off `dod.summary`, which is ALWAYS populated — so check always
          // returned NOT_FOUND and the DoD envelope below was dead code.)
          if (!doc.nodes.some((n) => n.id === nodeId)) {
            out.err('NOT_FOUND', `Node "${nodeId}" não encontrado no grafo`)
            return
          }

          // node_728743c96bd9 — heartbeat da colônia: o dono rodando check no
          // meio do trabalho renova a própria lease (TTL 300s < duração de task).
          // Sem identidade ⇒ no-op; mismatch ⇒ warning, nunca erro.
          const renewal = renewTaskClaim(store.getDb(), nodeId, process.env.AGF_AGENT_ID)
          if (renewal.mismatch) {
            log.warn('check:lease-renew-mismatch', { nodeId, owner: renewal.agentId })
          }

          const dod = checkDefinitionOfDone(doc, nodeId, {
            db: store.getDb(),
            dir: opts.dir,
            hasRedTestFirst: opts.redFirst,
          })
          const tdd = checkTddAdherence(doc, nodeId)

          const projectId = store.getProject()?.id ?? ''
          const db = store.getDb()

          let gateAttempts = 0
          if (!dod.ready) {
            recordDodFail(db, nodeId, projectId)
            const result = incrementGateAttempt(store, nodeId)
            gateAttempts = result.attempts
          } else {
            resetGateAttempts(store, nodeId)
          }

          const consecutiveFailures = getConsecutiveDodFailCount(db, nodeId)
          const quarantine_suggestion = consecutiveFailures >= 3
          const gateEscalated = gateAttempts >= MAX_GATE_ATTEMPTS

          // §ACO-LOOP-CLOSE (granular flow) — the granular flow is `check` →
          // `node status done`, which never calls `agf done`, so without this the
          // colony never learns from tasks completed outside the pipeline command.
          // Best-effort: never breaks check.
          let pheromoneDeposited = 0
          try {
            const outcome: TaskOutcome = { success: dod.ready, dodGrade: dod.grade }
            const tags = (doc.nodes.find((n) => n.id === nodeId)?.tags as string[] | undefined) ?? []
            const seen = new Set<string>()
            for (const tag of tags) {
              const key = tag.trim()
              if (key.length === 0 || seen.has(key)) continue
              seen.add(key)
              pheromoneDeposited += reinforceFromOutcome(
                (k, amount) => mmasDeposit(db, projectId, k, amount),
                key,
                outcome,
              )
            }
          } catch {
            /* pheromone deposit never breaks check */
          }

          // Opt-in mutation gate: real apply→test→restore pass on a source file.
          // Attached as a diagnostic; DoD remains the pass/fail driver. Delegate-safe
          // (fs + vitest subprocess, no provider).
          let mutation: Record<string, unknown> | undefined
          if (opts.mutation) {
            const node = doc.nodes.find((n) => n.id === nodeId)!
            const testFile = opts.test ?? node.testFiles?.[0]
            if (!opts.source) {
              mutation = { skipped: true, reason: '--source <file> é obrigatório com --mutation' }
            } else if (!testFile) {
              mutation = { skipped: true, reason: 'nó sem testFiles e nenhum --test informado' }
            } else {
              const threshold = opts.threshold !== undefined ? Number(opts.threshold) : undefined
              const run = runMutationGate(
                { sourceFile: opts.source, testFile, threshold },
                realMutationGateDeps(opts.dir),
              )
              mutation = {
                pass: run.gate.pass,
                killRatio: run.gate.killRatio,
                survivedCount: run.gate.survivedCount,
                total: run.summary.total,
                message: run.gate.message,
                sourceFile: opts.source,
                testFile,
              }
            }
          }

          // Opt-in execution-grounded gate: run the target's real test runner
          // (any language) and record a verifiable receipt. Diagnostic — DoD
          // remains the pass/fail driver; provenance can promote against the receipt.
          let tests: Record<string, unknown> | undefined
          if (opts.tests) {
            const node = doc.nodes.find((n) => n.id === nodeId)
            const testFiles = (node?.testFiles as string[] | undefined) ?? []
            const gate = runResolvedTestGate(opts.dir, testFiles, opts.testCmd)
            if (gate.ran && gate.passed && gate.receipt) {
              recordTestReceipt(db, {
                receipt: gate.receipt,
                nodeId,
                runner: gate.runner,
                exitCode: gate.exitCode,
                passed: true,
              })
            }
            tests = { ran: gate.ran, passed: gate.passed, runner: gate.runner, receipt: gate.receipt }
          }

          // Report-only: graph-integrity checkers (status-flow / done-integrity /
          // edge-consistency). Diagnostic surface for previously-dormant validator
          // capabilities — NEVER gates (dod.ready stays the pass/fail driver).
          const validator = buildValidatorReport(doc)

          // Surface-proof (node_56de4f2a54f3): read-only view of the scenario verdict.
          // Additive by construction — surfaceProofPayload contributes nothing for a
          // non-surface task, so today's output stays byte-identical for every task
          // that declares no scenario edge. It reports, it does not gate.
          const surfaceProof = surfaceProofPayload(dod.isSurface === true, surfaceProofState(store.getDb(), nodeId))

          const result = {
            dod: { ready: dod.ready, score: dod.score, grade: dod.grade, checks: dod.checks, ...surfaceProof },
            tdd,
            validator,
            pheromoneDeposited,
            gateAttempts,
            ...(gateEscalated
              ? {
                  gate_escalated: true,
                  applyVia: buildEscalationApplyVia(nodeId, doc.nodes.find((n) => n.id === nodeId)?.title ?? ''),
                }
              : {}),
            ...(tests ? { tests } : {}),
            ...(mutation ? { mutation } : {}),
            ...(quarantine_suggestion
              ? { quarantine_suggestion: true, consecutive_failures: consecutiveFailures }
              : {}),
          }

          // Files-modified warning: detect if no implementation files changed.
          // Diagnostic only — never fails the check.
          try {
            const gitDiff = spawnSync('git', ['diff', '--name-only', '--diff-filter=MAR', 'HEAD'], {
              cwd: opts.dir,
              encoding: 'utf-8',
              timeout: 5000,
            })
            const modified = gitDiff.stdout?.trim()
            if (!modified || modified.length === 0) {
              ;(result as Record<string, unknown>).files_modified_warning =
                'No modified files detected. Task may not have been implemented yet.'
            }
          } catch {
            // git not available or other error — never breaks check
          }

          if (!dod.ready) {
            out.fail('DOD_FAILED', dod.summary, result)
          } else {
            out.ok(result)
          }
        } finally {
          store.close()
        }
      },
    )
}
