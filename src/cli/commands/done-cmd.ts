/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { isReadableFile } from '../../core/utils/fs.js'
import { openStoreOrFail } from '../open-store.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { isHonestDoneTransition } from '../../core/planner/external-blocker.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { runResolvedTestGate } from '../../core/runner/execute-test-gate.js'
import { missingFiles } from '../../core/gaps/detect-phantom-done.js'
import { computeDeliveryCertainty } from '../../core/certainty/delivery-certainty.js'
import { evaluateCertaintyGate } from '../../core/certainty/certainty-gate.js'
import {
  detectScopeCreep,
  collectForeignInFlightFiles,
  DEFAULT_SCOPE_ALLOWLIST,
} from '../../core/gaps/detect-scope-creep.js'
import { isFixtureOnlyDelivery } from '../../core/gaps/detect-fixture-only.js'
import { makeFileExists } from '../shared/file-exists-port.js'
import { autoStageDeclaredFiles } from '../../core/git/auto-stage-declared-files.js'
import { findPotentiallySatisfiedChildren } from '../../core/utils/cascade-close-orphans.js'
import { findDeadCommentReferences } from '../../core/citations/citation-extractor.js'
import { recordTestReceipt } from '../../core/runner/test-receipt-store.js'
import { resolveQualityCommands } from '../../core/runner/resolve-quality-commands.js'
import { STORE_DIR } from '../../core/utils/constants.js'
import { recordTaskSavings, getCumulativeSavings } from '../../core/economy/savings-tracker.js'
import { computeFirstPassYield, evaluateFpyGate } from '../../core/economy/first-pass-yield.js'
import { insertEpisodicOutcome } from '../../core/store/episodic-outcomes-store.js'
import { recordTaskLearning } from '../../core/learning/record-task-learning.js'
import { generateId } from '../../core/utils/id.js'
import { incrementLlm, setProjectSaved } from '../../core/economy/token-economy-file.js'
import { createCliOutput } from '../shared/cli-output.js'
import { readHarnessScore, writeCompletionMemory } from './done-completion-memory.js'
import { maybeRunMemoryDynamicsTick } from '../../core/rag/memory-dynamics-tick.js'
import { runImmuneCycle } from '../../core/immune/index.js'
import { computeProgramCheckpoint, shouldEmitCheckpoint } from '../../core/quality/program-checkpoint.js'
import { recordDodDone } from '../../core/colony/auto-quarantine.js'
import { buildColonyHealthSnapshot } from '../../core/web/colony-health-snapshot.js'
import { buildColonyHealthMemoryName } from '../../core/colony/colony-health-history.js'
import { depositTaskReward } from '../../core/colony/task-reward-deposit.js'
import { mmasDeposit, type StagnationDecision } from '../../core/economy/mmas-pheromone.js'
import { runGaTick } from '../../core/economy/ga-tick.js'
import { runStagnationTick } from '../../core/economy/stagnation-tick.js'
import { isLeverEnabled, resolveEconomyLeversConfig } from '../../core/economy/economy-levers-config.js'
import { persistLessonFromDodFailure } from '../../core/autonomy/lessons-store.js'
import { selectFailedAcForLesson } from '../../core/autonomy/dod-lesson.js'
import { recordHarnessBlock } from '../../core/harness/savings-ledger.js'
import type { RewardSignals } from '../../core/economy/reward-strength.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { recordInManifest, getCurrentSessionId } from '../../core/hooks/session-manifest.js'
import { mineAndPersistScaffoldCandidates } from '../../core/rag-out/mine-on-done.js'
import { persistAccumulatedFacts } from '../../core/hooks/persist-extracted-facts.js'
import { releaseTaskClaim } from '../../core/planner/release-task-claim.js'
import { resolveReleaseAgentId } from '../../core/planner/resolve-agent-id.js'
import { closeSpecOnImplementerDone } from '../../core/graph/spec-close-on-done.js'
import {
  getGateAttempts,
  incrementGateAttempt,
  resetGateAttempts,
  buildEscalationApplyVia,
  MAX_GATE_ATTEMPTS,
} from '../../core/implementer/gate-attempt-tracker.js'
import {
  SuccessPatternTracker,
  derivePatternKey,
  buildStrategyMemory,
} from '../../core/harness/success-pattern-tracker.js'
import { writeMemory } from '../../core/memory/memory-reader.js'
import { buildCaseMemory } from '../../core/memory/case-distillation.js'
import { shouldSampleFlakyCheck, decideFlaky, DEFAULT_RERUN_COUNT } from '../../core/hooks/flaky-test-detector.js'
import { buildSpectraFromStore } from '../../core/insights/spectra-from-store.js'
import { emitSpectraRegressionHook } from '../../core/hooks/finalization-lifecycle-hooks.js'

const log = createLogger({ layer: 'cli', source: 'done.ts' })

export interface DodResult {
  passed: boolean
  score: number
  grade: string
}

export interface DoneDeps {
  findCurrentTask: (id: string) => { id: string; title: string } | null
  runDoD: (id: string) => DodResult
  storeMemory: (id: string) => string
  markDone: (id: string) => string
  suggestNext: () => { id: string; title: string; reason: string } | null
  out: (msg: string) => void
}

export interface DoneResult {
  taskId: string | null
  dodPassed: boolean
  dodScore: number
  dodGrade: string
  nextTask: string | null
  error?: string
}

export function doneTaskPipeline(taskId: string, deps: DoneDeps): DoneResult {
  if (!taskId) {
    deps.out('No task specified.')
    return { taskId: null, dodPassed: false, dodScore: 0, dodGrade: 'F', nextTask: null, error: 'No task specified' }
  }

  deps.out(`Completing task: ${taskId}`)

  const dod = deps.runDoD(taskId)
  deps.out(`DoD: ${dod.grade} (${dod.score}/100)`)

  if (!dod.passed) {
    deps.out('DoD failed — fix blockers before retrying.')
    return { taskId, dodPassed: false, dodScore: dod.score, dodGrade: dod.grade, nextTask: null }
  }

  const memory = deps.storeMemory(taskId)
  log.debug(`Memory: ${memory}`)

  deps.markDone(taskId)
  deps.out(`Task ${taskId} marked done.`)

  const next = deps.suggestNext()
  if (next) {
    deps.out(`Next: ${next.title} (${next.reason})`)
  } else {
    deps.out('No next task available.')
  }

  // §ECONOMY-HOOK: reminder on task completion
  deps.out('💡 Economy: use --select, --compressed, and agf exec in every interaction to save tokens.')

  return { taskId, dodPassed: true, dodScore: dod.score, dodGrade: dod.grade, nextTask: next?.id ?? null }
}

export function buildDoneDeps(
  store: SqliteStore,
  dir: string,
  out: (msg: string) => void = (m) => process.stderr.write(m + '\n'),
  agentIdFlag?: string,
): DoneDeps {
  // node_ca455c0520fc — paridade com o next: flag > AGF_AGENT_ID (sem uuid);
  // formiga com env setada mas sem flag não deixa mais lease órfã até o TTL.
  const agentId = resolveReleaseAgentId(agentIdFlag, process.env.AGF_AGENT_ID)
  return {
    findCurrentTask: (id: string) => {
      const node = store.getNodeById(id)
      return node ? { id: node.id, title: node.title } : null
    },
    runDoD: (id: string) => {
      const dod = checkDefinitionOfDone(store.toGraphDocument(), id, { dir })
      return { passed: dod.ready, score: dod.score, grade: dod.grade }
    },
    storeMemory: (id: string) => {
      const node = store.getNodeById(id)
      return writeCompletionMemory(dir, id, node?.title ?? id)
    },
    markDone: (id: string) => {
      store.updateNodeStatus(id, 'done')
      recordDodDone(store.getDb(), id, store.getProject()?.id ?? '')
      // Release any multi-agent claim so the resource frees immediately.
      if (agentId) {
        const claim = releaseTaskClaim(store.getDb(), id, agentId)
        if (claim.mismatch) {
          log.warn(
            `CLAIM_MISMATCH: task ${id} is claimed by agent ${claim.agentId ?? '?'}, not ${agentId}; proceeding anyway`,
          )
        }
      }
      return id
    },
    suggestNext: () => {
      const next = findNextTask(store.toGraphDocument())
      if (!next) return null
      return { id: next.node.id, title: next.node.title, reason: next.reason }
    },
    out,
  }
}

/** Builds the `agf done` CLI command (Commander definition). */
export function doneCommand(): Command {
  const cmd = new Command('done')
  cmd.description('Complete task: DoD check + run tests + memory store + mark done + suggest next')
  cmd.argument('[taskId]', 'Task ID to complete')
  cmd.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
  cmd.option('--skip-test', 'Skip running tests before marking done', false)
  cmd.option('--test-cmd <cmd>', 'Comando de teste explícito (sobrepõe a detecção de runner por linguagem)')
  cmd.option(
    '--gates <list>',
    'Gates extras agnósticos de linguagem antes do done: typecheck,lint (pula se a ferramenta não existir)',
  )
  cmd.option('--strict', 'Recusa o done se nenhum gate de teste real puder rodar (consistência obrigatória)', false)
  cmd.option('--force', 'Skip both tests and files-modified gate (use for importing already-completed work)', false)
  cmd.option(
    '--certainty',
    'Exige Delivery Certainty PROVEN (todos os pilares hard verdes) antes de marcar done — opt-in',
    false,
  )
  cmd.option('--no-learn', 'Não gravar PerfRecord no learning store (telemetria de routing)')
  cmd.option('--agent <id>', 'Release the claim lease held by this agent after completing the task')
  cmd.action(
    (
      taskId: string | undefined,
      opts: {
        dir: string
        skipTest?: boolean
        force?: boolean
        certainty?: boolean
        learn?: boolean
        testCmd?: string
        gates?: string
        strict?: boolean
        agent?: string
      },
    ) => {
      const out = createCliOutput('done')
      if (!taskId) {
        out.err('MISSING_ID', 'Uso: agf done <taskId>')
        return
      }
      log.debug(`agf done ${taskId}`)
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(taskId)
        if (!node) {
          out.err('NOT_FOUND', `Task não encontrada: ${taskId}`)
          return
        }

        // Honesty invariant (enforcement on entry, unconditional — --force does
        // NOT bypass this one): an externally/infra-blocked node is gated on a
        // human/infra action outside the repo, so it can never be honestly
        // marked done from here.
        if (!isHonestDoneTransition(node, 'done')) {
          out.fail(
            'EXTERNAL_BLOCKED_DONE',
            `Cannot mark "${taskId}" done: node is externally/infra-blocked (see metadata.blockReason). Resolve the blocker and clear it before marking done.`,
            { taskId },
          )
          return
        }

        if (!opts.force) {
          const attempts = getGateAttempts(node.metadata as Record<string, unknown> | undefined)
          if (attempts >= MAX_GATE_ATTEMPTS) {
            out.fail(
              'ESCALATION_REQUIRED',
              `Gate escalation: ${attempts} consecutive failures on "${taskId}". Create a bug node to track the root cause, or use --force to bypass.`,
              {
                taskId,
                attempts,
                applyVia: buildEscalationApplyVia(taskId, node.title),
              },
            )
            return
          }
        }

        const dod = checkDefinitionOfDone(store.toGraphDocument(), taskId, { dir: opts.dir })

        if (!dod.ready) {
          // §auto-pattern-memory — an AC-related DoD failure is a reusable pattern:
          // capture it as a lesson the builder loop can reuse (never breaks done).
          const failedAc = selectFailedAcForLesson(dod, node)
          if (failedAc) {
            try {
              persistLessonFromDodFailure(store.getDb(), taskId, failedAc)
            } catch (e) {
              log.debug(`auto-lesson skipped: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
          try {
            recordHarnessBlock(store.getDb(), {
              blockType: 'dod_failed',
              blockerModule: 'done-cmd.ts',
              nodeId: taskId,
              sessionId: getCurrentSessionId(),
            })
          } catch (e) {
            log.debug(`savings-ledger record skipped: ${e instanceof Error ? e.message : String(e)}`)
          }
          const { attempts: gateAttempts, escalated } = incrementGateAttempt(store, taskId)
          if (escalated) {
            out.fail(
              'ESCALATION_REQUIRED',
              `Gate escalation: ${gateAttempts} consecutive DoD failures on "${taskId}". Stop and triage — create a bug node to track the root cause, or use --force to bypass.`,
              {
                taskId,
                attempts: gateAttempts,
                dodScore: dod.score,
                dodGrade: dod.grade,
                applyVia: buildEscalationApplyVia(taskId, node.title),
              },
            )
            return
          }
          out.fail('DOD_FAILED', 'DoD failed — fix blockers before retrying.', {
            taskId,
            gateAttempts,
            dodScore: dod.score,
            dodGrade: dod.grade,
          })
          return
        }

        // M7: Files-modified gate — prevent hallucinated success.
        // Verifies that implementation files were actually modified.
        // Skipped when --force is provided (legitimately importing completed work).
        let modifiedFiles: string[] = []
        if (!opts.force) {
          // Auto-stage declared files before the diff check: `git diff HEAD`
          // does not see a brand-new file until it is staged, so a correctly
          // declared but never-`git add`'d file used to trip NO_FILES_MODIFIED
          // as if nothing had been done at all.
          const declaredForStaging = [
            ...((node.testFiles as string[] | undefined) ?? []),
            ...((node.implementationFiles as string[] | undefined) ?? []),
          ]
          const stageResult = autoStageDeclaredFiles(opts.dir, declaredForStaging)
          if (stageResult.failed.length > 0) {
            const first = stageResult.failed[0]
            out.fail(
              'NO_FILES_MODIFIED',
              `${first.file} is untracked — run git add ${first.file} before done, or use --force. (${first.error})`,
              { taskId, failed: stageResult.failed },
            )
            return
          }

          const gitDiff = spawnSync('git', ['diff', '--name-only', '--diff-filter=MARD', 'HEAD'], {
            cwd: opts.dir,
            encoding: 'utf-8',
            timeout: 10000,
          })
          const modified = gitDiff.stdout?.trim()
          if (!modified || modified.length === 0) {
            // node_22d90626e705: uma árvore limpa NÃO é necessariamente "nada feito" —
            // a entrega pode já estar COMMITADA. Aceitar SEM --force quando o node
            // declara impl+test que TODOS existem no disco (a mesma triangulação física
            // do gate PHANTOM_TESTFILE): uma entrega commitada provada por código+teste
            // reais é evidência mais forte que uma árvore suja arbitrária. Sem isso, os
            // dois gates se contradiziam (surgical-scope exige árvore restrita) e o único
            // escape era --force, que também pula os testes.
            const implFiles = (node.implementationFiles as string[] | undefined) ?? []
            const testFiles = (node.testFiles as string[] | undefined) ?? []
            const canTriangulate = implFiles.length > 0 && testFiles.length > 0
            const committedDeliveryOnDisk =
              canTriangulate && missingFiles([...implFiles, ...testFiles], makeFileExists(opts.dir)).length === 0
            if (!committedDeliveryOnDisk) {
              const gitError = gitDiff.stderr?.trim() || 'None'
              out.fail(
                'NO_FILES_MODIFIED',
                `No modified files found for "${taskId}". Tasks must be implemented before marking done. Use --force to override. (git: ${gitError})`,
                { taskId },
              )
              return
            }
            log.info('done:committed-delivery-triangulated', { taskId, implFiles, testFiles })
          } else {
            modifiedFiles = modified.split('\n').filter(Boolean)
          }
        }

        // Anti-hallucination gate (enforcement on entry): refuse `done` when a
        // declared testFile does not exist on disk — a delivery no real test
        // backs. Resolved against the target project's dir (--dir), so it holds
        // for ANY project agf drives, not just this repo. `--force` bypasses.
        if (!opts.force) {
          const declared = [
            ...((node.testFiles as string[] | undefined) ?? []),
            ...((node.implementationFiles as string[] | undefined) ?? []),
          ]
          const phantom = missingFiles(declared, makeFileExists(opts.dir))
          if (phantom.length > 0) {
            out.fail(
              'PHANTOM_TESTFILE',
              `Cannot mark "${taskId}" done: declared file(s) do not exist on disk: ${phantom.join(', ')}. Create the file(s) or fix the testFiles/implementationFiles list (status 'done' without physical code+test is a hallucination). Use --force to override.`,
              { taskId, phantomFiles: phantom },
            )
            return
          }
        }

        // Delivery Certainty gate (node_03aed600188a) — OPT-IN. Default OFF
        // keeps `done` byte-identical; with --certainty, only a PROVEN verdict
        // (every HARD pillar green) may close the task. The refusal names the
        // blocking pillars so the operator knows exactly what is missing.
        if (opts.certainty) {
          const verdict = evaluateCertaintyGate(
            computeDeliveryCertainty(store.toGraphDocument(), taskId, {
              fileExists: makeFileExists(opts.dir),
            }),
          )
          if (verdict.blocked) {
            out.fail(
              'CERTAINTY_NOT_MET',
              `Cannot mark "${taskId}" done: ${verdict.reason}. Prove it in the consumer's mode (agf submit ${taskId} --consumer-proof "<command>") or fix the missing files, then retry.`,
              { taskId, band: verdict.band, confidence: verdict.confidence, blockingPillars: verdict.blockingPillars },
            )
            return
          }
        }

        // Blast-radius gate: "done with a leaked scope" was only avoided
        // because the agent remembered to check. Reuses the same modified-
        // files list the NO_FILES_MODIFIED gate already captured above — one
        // `git diff`, not two.
        if (!opts.force) {
          const declared = [
            ...((node.testFiles as string[] | undefined) ?? []),
            ...((node.implementationFiles as string[] | undefined) ?? []),
          ]
          // node_58932e8189fc — tree compartilhado entre formigas: arquivos
          // declarados das OUTRAS tasks in_progress são fronteira alheia, não
          // scope creep meu; um sujo órfão continua bloqueando o done.
          const foreignInFlight = collectForeignInFlightFiles(store.toGraphDocument().nodes, taskId)
          const undeclared = detectScopeCreep(modifiedFiles, declared, [...DEFAULT_SCOPE_ALLOWLIST, ...foreignInFlight])
          if (undeclared.length > 0) {
            out.fail(
              'BLAST_RADIUS_EXCEEDED',
              `Cannot mark "${taskId}" done: modified file(s) outside the declared scope: ${undeclared.join(', ')}. Declare them via agf node update ${taskId} --implementation-files, or use --force.`,
              { taskId, undeclared },
            )
            return
          }
        }

        // Fixture-only gate: a test green against a small hand-built fixture
        // proves the happy path, not that a core module (parser/interpreter/
        // compiler/core/) survives the real corpus — the most expensive
        // real pattern seen this session.
        if (!opts.force) {
          const implementationFiles = (node.implementationFiles as string[] | undefined) ?? []
          const taskTestFiles = (node.testFiles as string[] | undefined) ?? []
          const testFileContents = taskTestFiles
            .map((rel) => join(opts.dir, rel))
            .filter((abs) => isReadableFile(abs))
            .map((abs) => readFileSync(abs, 'utf-8'))
          if (isFixtureOnlyDelivery(implementationFiles, testFileContents)) {
            out.fail(
              'FIXTURE_ONLY',
              `Cannot mark "${taskId}" done: core module test only exercises fixtures, not corpus. Add a test referencing corpus/, or use --force.`,
              { taskId },
            )
            return
          }
        }

        // Dead comments — a comment citing a path that no longer exists is
        // silent rot (CLAUDE.md rule 6: a lying comment is worse than none).
        // Scan the task's own declared files; never blocks `done`, only warns.
        const deadCommentWarnings: string[] = []
        {
          const declaredFiles = [
            ...((node.testFiles as string[] | undefined) ?? []),
            ...((node.implementationFiles as string[] | undefined) ?? []),
          ]
          const fileExists = makeFileExists(opts.dir)
          for (const rel of declaredFiles) {
            const abs = join(opts.dir, rel)
            if (!isReadableFile(abs)) continue
            const content = readFileSync(abs, 'utf-8')
            const dead = findDeadCommentReferences(content, fileExists)
            for (const ref of dead) {
              deadCommentWarnings.push(`${rel}: dead comment references "${ref}" which does not exist on disk`)
            }
          }
        }

        let flakyWarning: string | undefined
        if (!opts.skipTest && !opts.force) {
          const testFiles = (node.testFiles as string[] | undefined) ?? []
          const gate = runResolvedTestGate(opts.dir, testFiles, opts.testCmd)
          if (!gate.ran) {
            // No test runner detected for the target stack. Permissive by default;
            // `--strict` refuses the done so consistency is enforceable on any project.
            if (opts.strict) {
              out.fail(
                'NO_TEST_GATE',
                'Strict: nenhum gate de teste pôde rodar (stack sem runner detectado). Adicione testes ou passe --test-cmd.',
                { taskId },
              )
              return
            }
            log.info('done:no-test-runner', { hint: 'nenhum runner detectado — gate de teste pulado (use --test-cmd)' })
          } else if (!gate.passed) {
            const { attempts: gateAttempts, escalated } = incrementGateAttempt(store, taskId)
            if (escalated) {
              out.fail(
                'ESCALATION_REQUIRED',
                `Gate escalation: ${gateAttempts} consecutive test failures on "${taskId}". Stop and triage — create a bug node to track the root cause, or use --force to bypass.`,
                {
                  taskId,
                  attempts: gateAttempts,
                  runner: gate.runner,
                  exitCode: gate.exitCode,
                  applyVia: buildEscalationApplyVia(taskId, node.title),
                },
              )
              return
            }
            out.fail(
              'TESTS_FAILED',
              `Tests did not pass (${gate.runner}, code ${gate.exitCode}). Fix tests and retry.`,
              {
                taskId,
                gateAttempts,
                runner: gate.runner,
                dodScore: dod.score,
                dodGrade: dod.grade,
                testOutput: gate.output,
              },
            )
            return
          } else if (gate.receipt) {
            // Record the passing run so provenance can promote this node to
            // `validated` against a real receipt (no string can fake it).
            recordTestReceipt(store.getDb(), {
              receipt: gate.receipt,
              nodeId: taskId,
              runner: gate.runner,
              exitCode: gate.exitCode,
              passed: true,
            })
            log.info('done:tests-green', { runner: gate.runner, receipt: gate.receipt })

            // §EPIC-21.T04 — flaky-test sampling: a rare (default 5%), extra
            // cost to catch a real bug — a "passing" test that intermittently
            // fails. Reruns the SAME gate DEFAULT_RERUN_COUNT-1 more times.
            if (shouldSampleFlakyCheck()) {
              const outcomes: Array<'pass' | 'fail'> = ['pass']
              for (let i = 1; i < DEFAULT_RERUN_COUNT; i++) {
                const rerun = runResolvedTestGate(opts.dir, testFiles, opts.testCmd)
                outcomes.push(rerun.passed ? 'pass' : 'fail')
              }
              const decision = decideFlaky({ outcomes })
              if (decision.flaky) {
                flakyWarning = `FLAKY_TEST_SUSPECTED: ${decision.passes} pass / ${decision.fails} fail across ${outcomes.length} reruns (runner ${gate.runner})`
                log.warn('done:flaky-test-suspected', { taskId, ...decision, runner: gate.runner })
              }
            }
          }
        }

        // Phase-4 opt-in quality gates (language-agnostic typecheck/lint). A gate
        // whose tool is absent is skipped with a warning, never a hard failure.
        if (opts.gates && !opts.force) {
          const requested = opts.gates
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          const quality = resolveQualityCommands(opts.dir)
          for (const gateName of requested) {
            const rc = gateName === 'typecheck' ? quality.typecheck : gateName === 'lint' ? quality.lint : undefined
            if (!rc) {
              log.info('done:gate-skip', { gate: gateName, reason: 'nenhuma ferramenta detectada para o stack' })
              continue
            }
            const res = spawnSync(rc.cmd, rc.args, { cwd: opts.dir, stdio: 'pipe', shell: true })
            if (res.status !== 0) {
              const { attempts: gateAttempts, escalated } = incrementGateAttempt(store, taskId)
              if (escalated) {
                out.fail(
                  'ESCALATION_REQUIRED',
                  `Gate escalation: ${gateAttempts} consecutive failures on "${taskId}" (gate: ${gateName}). Stop and triage — create a bug node.`,
                  {
                    taskId,
                    attempts: gateAttempts,
                    gate: gateName,
                    applyVia: buildEscalationApplyVia(taskId, node.title),
                  },
                )
                return
              }
              out.fail(
                'GATE_FAILED',
                `Gate "${gateName}" (${rc.runner}) falhou (code ${res.status}). Corrija e tente de novo.`,
                {
                  taskId,
                  gateAttempts,
                  gate: gateName,
                  runner: rc.runner,
                  output: (res.stdout.toString('utf-8') + res.stderr.toString('utf-8')).slice(-1000),
                },
              )
              return
            }
          }
        }

        writeCompletionMemory(opts.dir, taskId, node.title)
        store.updateNodeStatus(taskId, 'done', opts.force ? { skipHooks: true } : undefined)
        closeSpecOnImplementerDone(store, taskId)

        // Release multi-agent claim so the resource frees immediately after done.
        const envelopeWarnings: string[] = [...deadCommentWarnings, ...(flakyWarning ? [flakyWarning] : [])]
        const releaseAgent = resolveReleaseAgentId(opts.agent, process.env.AGF_AGENT_ID)
        if (releaseAgent) {
          const claimRelease = releaseTaskClaim(store.getDb(), taskId, releaseAgent)
          if (claimRelease.mismatch) {
            const msg = `CLAIM_MISMATCH: task ${taskId} held by agent ${claimRelease.agentId ?? '?'}, not ${releaseAgent}; proceeding anyway`
            log.warn(msg)
            envelopeWarnings.push('CLAIM_MISMATCH')
          }
        }

        // Backlog children whose AC has high textual overlap with this
        // just-closed node's AC/declared files are likely already implemented
        // as part of this delivery — surface as a warning, never auto-close.
        const potentiallySatisfied = findPotentiallySatisfiedChildren(store, taskId)
        for (const candidate of potentiallySatisfied) {
          envelopeWarnings.push(
            `${candidate.nodeId} (${candidate.title}) is a potentially satisfied child — verify and close with agf node status ${candidate.nodeId} done`,
          )
        }

        // §E5.2 — Snapshot colony-health after each successful completion.
        try {
          const healthSnap = buildColonyHealthSnapshot(store.getStats())
          const snapName = buildColonyHealthMemoryName(new Date())
          const memDir = join(opts.dir, STORE_DIR, 'memories')
          mkdirSync(memDir, { recursive: true })
          writeFileSync(
            join(memDir, `${snapName}.md`),
            JSON.stringify({ ...healthSnap, taskId, date: new Date().toISOString() }, null, 2),
            'utf-8',
          )
        } catch {
          /* colony health snapshot never breaks done */
        }

        // Spiral feedback: record the success so Φ(flow) rises for the next turn.
        try {
          insertEpisodicOutcome(store.getDb(), {
            id: generateId('epi'),
            nodeId: taskId,
            taskType: (node.type as string) ?? '',
            tags: '',
            approachSummary: 'done',
            outcome: 'success',
            cycleTimeDelta: 0,
            reopenCount: 0,
            createdAt: Date.now(),
          })
        } catch {
          /* telemetry never breaks done */
        }

        // Feed the learning store so `agf learning` reflects real task outcomes
        // (opt-out via --no-learn). Best-effort: telemetry never breaks done.
        if (opts.learn !== false) {
          try {
            recordTaskLearning(store, { nodeId: taskId, acPassed: dod.ready })
          } catch {
            /* telemetry never breaks done */
          }
        }

        recordTaskSavings(store, taskId, node.title)

        // Update global token-economy.json (across all projects)
        try {
          const ledger = store
            .getDb()
            .prepare(
              'SELECT COALESCE(SUM(input_tokens),0) as tin, COALESCE(SUM(output_tokens),0) as tout, COALESCE(SUM(cached_input_tokens),0) as cache, COALESCE(SUM(cost_usd),0) as cost FROM llm_call_ledger',
            )
            .get() as { tin: number; tout: number; cache: number; cost: number }
          if (ledger.tin > 0 || ledger.tout > 0) {
            incrementLlm(opts.dir, ledger.tin, ledger.tout, ledger.cache, ledger.cost)
          }
        } catch {
          /* never fail done because of economy file */
        }

        const savings = getCumulativeSavings(store)

        // Persist the cumulative lever economy (RAG in/out, compression, …) into
        // the global token-economy.json so it survives across sessions/projects.
        try {
          setProjectSaved(opts.dir, savings.leverSavedTotal ?? 0)
        } catch {
          /* never fail done because of the economy file */
        }

        // §ACO-LOOP-CLOSE — deposit pheromone on the completed task's tags so the
        // `agf next --aco` roulette has a real trail to follow. Strength comes from
        // delegate-mode-aware reward signals: in fully-delegated mode (no provider,
        // tokensSaved=0) a passing DoD still lays a non-zero trail, so the colony
        // learns from externally-driven work. Best-effort: never breaks done.
        let pheromoneDeposited = 0
        try {
          const prev = readHarnessScore(opts.dir, 'leafcutter-harness-prev-breakdown')
          const baseline = readHarnessScore(opts.dir, 'leafcutter-harness-baseline')
          const harnessDelta = prev !== null && baseline !== null ? prev - baseline : 0
          const signals: RewardSignals = {
            tokensSaved: savings.leverSavedTotal ?? 0,
            harnessDelta,
            acPass: dod.ready,
            cycleTimeMs: 0,
          }
          const db = store.getDb()
          const projectId = store.getProject()?.id ?? ''
          const tags = (node.tags as string[] | undefined) ?? []
          // MMAS-bounded deposit: clamp each trail at τ_max so reward never
          // saturates the field unbounded (keeps exploration pressure alive).
          pheromoneDeposited = depositTaskReward({ tags, signals }, (key, amount) =>
            mmasDeposit(db, projectId, key, amount),
          )
        } catch {
          /* pheromone deposit never breaks done */
        }

        // §ACO-PHASE6 — stagnation control, run after the deposits (MMAS order):
        // evaporate ρ, measure colony entropy, and re-diversify (reset) if the
        // search has converged too far, or recommend a higher α if too diffuse.
        // Gated behind the aco_autotune lever (default OFF = byte-identical).
        // Best-effort: never breaks done.
        let stagnation: StagnationDecision | undefined
        try {
          const acoEnabled = isLeverEnabled(resolveEconomyLeversConfig(store), 'aco_autotune')
          const decision = runStagnationTick(store.getDb(), store.getProject()?.id ?? '', {
            leverEnabled: acoEnabled,
            nodeId: taskId,
          })
          stagnation = decision ?? undefined
        } catch {
          /* stagnation control never breaks done */
        }

        // §ACO-PHASE7 — GA autotune (smart-default): evolve the aco_autotune genome from real
        // selection episodes and persist it, so the next `agf next` selects with learned α
        // (T6c). Auto-engages once there are enough episodes — no lever to flip (regra 16) —
        // with its own cold-start guard + never-throws contract. Keep the call defensive too.
        try {
          runGaTick(store)
        } catch {
          /* GA autotune never breaks done */
        }

        const next = findNextTask(store.toGraphDocument())

        // Program checkpoint: emit at every 10th completed task
        const doneCount = store.getStats().byStatus['done'] ?? 0
        const programCheckpoint = shouldEmitCheckpoint(doneCount)
          ? computeProgramCheckpoint(
              doneCount,
              readHarnessScore(opts.dir, 'leafcutter-harness-prev-breakdown'),
              readHarnessScore(opts.dir, 'leafcutter-harness-baseline'),
            )
          : undefined

        // M6: Record in session manifest for integrity verification
        try {
          const modifiedFiles = spawnSync('git', ['diff', '--name-only', '--diff-filter=MARD', 'HEAD'], {
            cwd: opts.dir,
            encoding: 'utf-8',
            timeout: 5000,
          })
          const fileList = modifiedFiles.stdout?.trim().split('\n').filter(Boolean) ?? []
          recordInManifest(`done ${taskId}`, 0, fileList.length, fileList, undefined, taskId)
        } catch {
          /* manifest never breaks done */
        }

        // §success-pattern-memory — mirror of the DoD-failure lesson above (line
        // ~225), for the success side (Hu et al. 2026 §4.2.2/§5.1.2). Never
        // blocks done: recordSuccess/writeMemory failures are swallowed.
        if (dod.grade === 'A') {
          try {
            const patternKey = derivePatternKey(node)
            const result = new SuccessPatternTracker(store.getDb()).recordSuccess(
              patternKey,
              taskId,
              `Grade A DoD (score ${dod.score}) on "${node.title}"`,
            )
            if (result.shouldEmit && patternKey) {
              const memory = buildStrategyMemory({
                patternKey,
                nodeIds: result.contributingNodeIds,
                rationales: result.contributingRationales,
              })
              // writeMemory appends .md itself and resolves under
              // <dir>/workflow-graph/memories/ — pass the bare name.
              void writeMemory(opts.dir, memory.name, memory.content).catch((e) =>
                log.debug(`success-pattern memory write skipped: ${e instanceof Error ? e.message : String(e)}`),
              )
            }
          } catch (e) {
            log.debug(`success-pattern tracking skipped: ${e instanceof Error ? e.message : String(e)}`)
          }

          // node_wire_3111ce1fe056 — case-distillation: per-task experiential memory
          // (distinct from the aggregate strategy memory above). Gates on a real
          // rationale (node.description) + observed testFiles; never blocks done.
          try {
            const caseMemory = buildCaseMemory({
              node,
              grade: dod.grade,
              rationale: node.description ?? '',
              testFiles: node.testFiles ?? [],
            })
            if (caseMemory.shouldWrite && caseMemory.name && caseMemory.content) {
              void writeMemory(opts.dir, caseMemory.name, caseMemory.content).catch((e) =>
                log.debug(`case-distillation memory write skipped: ${e instanceof Error ? e.message : String(e)}`),
              )
            }
          } catch (e) {
            log.debug(`case-distillation skipped: ${e instanceof Error ? e.message : String(e)}`)
          }
        }

        // node_wire_741ead0b17ca — spectra-regression-gate: compare the 5 behaviour
        // spectra against the last-recorded baseline; emit spectra:regression if any
        // dropped beyond the threshold. Never blocks done: swallowed on any failure.
        try {
          const current = buildSpectraFromStore(store)
          const baselineRaw = store.getProjectSetting('spectra_baseline')
          if (baselineRaw) {
            const baseline = JSON.parse(baselineRaw) as typeof current
            emitSpectraRegressionHook({ baseline, current })
          }
          store.setProjectSetting('spectra_baseline', JSON.stringify(current))
        } catch (e) {
          log.debug(`spectra-regression-gate skipped: ${e instanceof Error ? e.message : String(e)}`)
        }

        // FPY (F3.T3): assertividade da janela no envelope + gate OPCIONAL.
        // Setting fpy_gate_threshold ausente/0 = OFF (done byte-idêntico).
        const fpy = computeFirstPassYield(store.getDb(), { maxAgeDays: 30 })
        const fpyThresholdRaw = store.getProjectSetting('fpy_gate_threshold')
        const fpyThreshold = fpyThresholdRaw ? Number(fpyThresholdRaw) : 0
        const fpyGate = evaluateFpyGate(fpy, Number.isFinite(fpyThreshold) ? fpyThreshold : 0)
        if (!fpyGate.passed) {
          out.fail('FPY_BELOW_THRESHOLD', fpyGate.reason ?? 'first-pass yield abaixo do limiar', { fpy })
          process.exitCode = 1
          return
        }

        resetGateAttempts(store, taskId)

        out.ok({
          taskId,
          dodScore: dod.score,
          dodGrade: dod.grade,
          fpy,
          savings,
          pheromoneDeposited,
          ...(stagnation ? { stagnation } : {}),
          next: next ? { id: next.node.id, title: next.node.title, reason: next.reason } : null,
          ...(programCheckpoint ? { programCheckpoint } : {}),
          ...(envelopeWarnings.length > 0 ? { warnings: envelopeWarnings } : {}),
        })
      } finally {
        try {
          runImmuneCycle(store.getDb(), store.getProject()?.id ?? 'default', [], 'done')
        } catch {
          /* immune cycle never breaks done */
        }

        maybeRunMemoryDynamicsTick(store)

        // §auto-pattern-memory — mine recurring task-title patterns into scaffold candidates
        const completedGoals = store
          .toGraphDocument()
          .nodes.filter((n) => n.status === 'done')
          .map((n) => n.title)
        mineAndPersistScaffoldCandidates(completedGoals, opts.dir)
        persistAccumulatedFacts(opts.dir, { resetAfter: true })

        store.close()
      }
    },
  )
  return cmd
}
