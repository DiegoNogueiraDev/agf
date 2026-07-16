/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf submit` — fecha o loop do MODO DELEGADO (agnóstico a qualquer CLI-agente).
 *
 * No modo delegado, a CLI-agente que dirige (Claude/Copilot/Codex/…) executa o
 * brief (`agf brief <id>`) com seu próprio LLM, aplica os edits no workspace com
 * suas próprias ferramentas e devolve o resultado estruturado
 * (`{arquivos[], testes{passed,failed}, desvios[]}`). Este comando é a contraparte
 * determinística do `agf brief`: ingere esse resultado, **valida o contrato**, roda
 * o gate de teste (blast) por conta própria (não confia cego no relatório), roda o
 * DoD, materializa `desvios` como findings no grafo e marca a task `done`.
 *
 * Núcleo puro (`submitPipeline`) por injeção de deps — testável sem spawnar vitest
 * nem abrir SQLite (mesmo padrão de `doneTaskPipeline`).
 */
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { maybeRunMemoryDynamicsTick } from '../../core/rag/memory-dynamics-tick.js'
import { releaseTaskClaim } from '../../core/planner/release-task-claim.js'
import { resolveReleaseAgentId } from '../../core/planner/resolve-agent-id.js'
import { openStoreOrFail } from '../open-store.js'
import { findNextTask } from '../../core/planner/next-task.js'
import { checkDefinitionOfDone } from '../../core/implementer/definition-of-done.js'
import { runResolvedTestGate } from '../../core/runner/execute-test-gate.js'
import { parseExecutorResult, type ExecutorResult } from '../../core/context/executor-brief.js'
import { verifyCascadeResponse, type CascadeVerdict } from '../../core/llm/cascade-verifier.js'
import { finalizeTask } from '../../core/autonomy/task-prep.js'
import { computeTaskSignature } from '../../core/reuse/task-signature.js'
import { recordModelCall } from '../../core/observability/llm-call-ledger.js'
import { recordTaskSavings, getCumulativeSavings } from '../../core/economy/savings-tracker.js'
import { recordPilotCall } from '../../core/observability/pilot-ledger.js'
import { writeCompletionMemory } from './done-completion-memory.js'
import { generateId } from '../../core/utils/id.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { GraphNode, NodeType, NodeStatus } from '../../core/graph/graph-types.js'

const log = createLogger({ layer: 'cli', source: 'submit-cmd.ts' })

export interface SubmitVerification {
  verdict: CascadeVerdict
  /** true só quando `gate` está ON e o verdict reprovou — bloqueia o submit. */
  blocked: boolean
}

/**
 * Paridade provider↔delegado (node_a53983db0181): roda o MESMO juiz determinístico
 * da cascata (cascade-verifier) no caminho delegado (submit), não só no provider.
 * O schema já é hard-gate via parseExecutorResult ANTES daqui; aqui a dimensão que
 * agrega é a cobertura de keywords do AC no resultado. Gate opt-in (`--verify`):
 * default OFF ⇒ verdict só informativo (advisory), zero mudança de comportamento;
 * ON ⇒ reprova (blocked) pede correção à formiga (o equivalente delegado da
 * escalada cheap→frontier do provider). Sem acLines ⇒ nunca bloqueia (nada a cobrar).
 */
export function buildSubmitVerification(
  raw: string,
  acLines: readonly string[],
  opts: { gate: boolean; threshold: number },
): SubmitVerification {
  if (acLines.length === 0) {
    return { verdict: { pass: true, score: 1, reasons: [] }, blocked: false }
  }
  const verdict = verifyCascadeResponse(raw, { acLines, expectJson: true, threshold: opts.threshold })
  return { verdict, blocked: opts.gate && !verdict.pass }
}

export interface SubmitDeps {
  getTask: (id: string) => { id: string; title: string } | null
  /** Gate de teste independente. `{ passed }` — output só p/ diagnóstico. */
  runBlast: () => { passed: boolean; output?: string }
  runDoD: (id: string) => { passed: boolean; score: number; grade: string }
  /** Materializa desvios como findings; retorna os ids criados. */
  recordDeviations: (id: string, desvios: string[]) => string[]
  markDone: (id: string) => void
}

export type SubmitOutcome =
  | { accepted: true; taskId: string; dodScore: number; dodGrade: string; findingIds: string[]; deviations: string[] }
  | {
      accepted: false
      taskId: string
      code: 'NOT_FOUND' | 'TESTS_FAILED' | 'DOD_FAILED'
      reason: string
      detail?: unknown
    }

/**
 * Núcleo puro do submit. Ordem: existe → executor não reportou falha → blast
 * verde → DoD ok → grava desvios → done. Falha em qualquer etapa não marca done.
 */
export function submitPipeline(taskId: string, result: ExecutorResult, deps: SubmitDeps): SubmitOutcome {
  const task = deps.getTask(taskId)
  if (!task) return { accepted: false, taskId, code: 'NOT_FOUND', reason: `Task não encontrada: ${taskId}` }

  if (result.testes.failed > 0) {
    return {
      accepted: false,
      taskId,
      code: 'TESTS_FAILED',
      reason: `Executor reportou ${result.testes.failed} teste(s) falhando.`,
      detail: result.testes,
    }
  }

  const blast = deps.runBlast()
  if (!blast.passed) {
    return {
      accepted: false,
      taskId,
      code: 'TESTS_FAILED',
      reason: 'Gate de teste (blast) falhou.',
      detail: blast.output,
    }
  }

  const dod = deps.runDoD(taskId)
  if (!dod.passed) {
    return {
      accepted: false,
      taskId,
      code: 'DOD_FAILED',
      reason: 'DoD falhou — resolva os blockers.',
      detail: { score: dod.score, grade: dod.grade },
    }
  }

  const findingIds = deps.recordDeviations(taskId, result.desvios)
  deps.markDone(taskId)
  return { accepted: true, taskId, dodScore: dod.score, dodGrade: dod.grade, findingIds, deviations: result.desvios }
}

/** Materializa cada desvio do executor como um finding (risk) ligado à task. */
export function recordDeviations(store: SqliteStore, taskId: string, desvios: string[]): string[] {
  const ids: string[] = []
  const ts = new Date().toISOString()
  for (const d of desvios) {
    if (!d || !d.trim()) continue
    const node: GraphNode = {
      id: generateId('node'),
      type: 'risk' as NodeType,
      title: `Desvio (executor): ${d.slice(0, 120)}`,
      description: d,
      status: 'backlog' as NodeStatus,
      priority: 3,
      xpSize: 'S',
      parentId: taskId,
      acceptanceCriteria: [],
      tags: ['executor-deviation'],
      createdAt: ts,
      updatedAt: ts,
      metadata: { source: 'submit' },
    }
    store.insertNode(node)
    store.insertEdge({ id: generateId('edge'), from: taskId, to: node.id, relationType: 'parent_of', createdAt: ts })
    ids.push(node.id)
  }
  return ids
}

/**
 * Re-run the target project's test gate independently of the executor's report
 * (the delegated executor's {passed,failed} is advisory; this is the hard gate).
 * Delegates to the shared, language-agnostic gate.
 */
function runTestGate(dir: string, testFiles: string[], explicit?: string | null): { passed: boolean; output?: string } {
  const gate = runResolvedTestGate(dir, testFiles, explicit)
  return { passed: gate.passed, output: gate.output }
}

/** Builds the `agf submit` CLI command (Commander definition). */
/**
 * Resolve the external agent's self-reported token counts from either the combined
 * `--tokens <in,out>` flag or the discrete `--tokens-in`/`--tokens-out` pair. Combined wins.
 * Non-finite / absent values → undefined (byte-identical: no ledger row).
 */
export function resolveConductorTokens(opts: { tokens?: string; tokensIn?: string; tokensOut?: string }): {
  tokensIn?: number
  tokensOut?: number
} {
  const finite = (v: number | undefined): number | undefined => (v !== undefined && Number.isFinite(v) ? v : undefined)
  if (opts.tokens) {
    const [i, o] = opts.tokens.split(',').map((s) => Number(s.trim()))
    return { tokensIn: finite(i), tokensOut: finite(o) }
  }
  return {
    tokensIn: finite(opts.tokensIn !== undefined ? Number(opts.tokensIn) : undefined),
    tokensOut: finite(opts.tokensOut !== undefined ? Number(opts.tokensOut) : undefined),
  }
}

/**
 * Record the driving agent's self-reported usage in `llm_call_ledger`, attributed to the task.
 * `provider: 'delegated'` is the self-reported marker (agf made no billed call in delegate mode);
 * `agf metrics` surfaces these separately. Never throws — a ledger write must not break the close.
 */
export function recordConductorTokens(
  store: SqliteStore,
  taskId: string,
  tokensIn: number,
  tokensOut: number,
  model?: string,
): void {
  try {
    recordModelCall(store.getDb(), {
      sessionId: `delegate_${taskId}`,
      ...(store.getProject()?.id ? { projectId: store.getProject()?.id } : {}),
      nodeId: taskId,
      caller: 'delegate',
      provider: 'delegated',
      model: model ?? 'delegated',
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      status: 'ok',
    })
  } catch {
    // ledger never breaks the close
  }
}

export function submitCommand(): Command {
  const cmd = new Command('submit')
  cmd.description('Modo delegado: ingere o resultado do executor (brief) → valida → blast → DoD → done')
  cmd.argument('<taskId>', 'Task ID que foi delegada')
  cmd.option('--result <json>', 'Resultado do executor em JSON ({arquivos,testes,desvios})')
  cmd.option('--from-file <path>', 'Arquivo com o JSON do resultado do executor')
  cmd.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
  cmd.option('--skip-test', 'Pular o gate de teste (blast) — use só p/ tasks sem código', false)
  cmd.option('--test-cmd <cmd>', 'Comando de teste explícito (sobrepõe a detecção de runner por linguagem)')
  cmd.option(
    '--tokens <in,out>',
    'Tokens in,out do agente condutor (→ llm_call_ledger, self-reported). Ex: --tokens 1200,800',
  )
  cmd.option('--tokens-in <n>', 'Tokens de input gastos pelo agente externo (→ llm_call_ledger, lever delegated)')
  cmd.option('--tokens-out <n>', 'Tokens de output gastos pelo agente externo (→ llm_call_ledger)')
  cmd.option('--model <id>', 'Modelo usado pelo agente externo (rótulo no ledger)')
  cmd.option('--agent <id>', 'Release the claim lease held by this agent after submit')
  cmd.option('--verify', 'Roda o cascade-verifier (paridade com o provider); reprova bloqueia o submit', false)
  cmd.option('--verify-threshold <n>', 'Limiar do verificador quando --verify está ativo (default 0.6)', parseFloat)
  cmd.action(
    (
      taskId: string,
      opts: {
        result?: string
        fromFile?: string
        dir: string
        skipTest?: boolean
        testCmd?: string
        tokens?: string
        tokensIn?: string
        tokensOut?: string
        model?: string
        agent?: string
        verify?: boolean
        verifyThreshold?: number
      },
    ) => {
      const out = createCliOutput('submit')
      if (!taskId) {
        out.err('MISSING_ID', 'Uso: agf submit <taskId> --result <json> | --from-file <path>')
        return
      }

      // Standalone conductor-token report: `agf submit <id> --tokens 1200,800` with no executor
      // result just records the driving agent's self-reported usage (attributed to the task) and
      // returns — making the dominant, delegate-mode cost visible without a full submit.
      const conductorTokens = resolveConductorTokens(opts)
      const hasConductorTokens = conductorTokens.tokensIn !== undefined || conductorTokens.tokensOut !== undefined
      if (hasConductorTokens && !opts.result && !opts.fromFile) {
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (!store.getNodeById(taskId)) {
            out.err('NOT_FOUND', `Task ${taskId} não encontrada`)
            return
          }
          const tokensIn = conductorTokens.tokensIn ?? 0
          const tokensOut = conductorTokens.tokensOut ?? 0
          recordConductorTokens(store, taskId, tokensIn, tokensOut, opts.model)
          out.ok({ taskId, tokensIn, tokensOut, provider: 'delegated', selfReported: true, recorded: true })
          return
        } finally {
          store.close()
        }
      }

      let raw: string
      try {
        raw = opts.fromFile ? readFileSync(opts.fromFile, 'utf-8') : (opts.result ?? '')
      } catch (err) {
        out.err('NOT_FOUND', `Não foi possível ler --from-file: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      if (!raw.trim()) {
        out.err('MISSING_ID', 'Forneça --result <json> ou --from-file <path> com o resultado do executor')
        return
      }

      const result = parseExecutorResult(raw)
      if (!result) {
        out.err('INVALID_FORMAT', 'Resultado inválido — esperado {arquivos[], testes{passed,failed}, desvios[]}')
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const node = store.getNodeById(taskId)

        // Paridade provider↔delegado (node_a53983db0181): o mesmo juiz da cascata
        // no caminho delegado. Advisory por default (só informa); --verify bloqueia.
        const verification = buildSubmitVerification(raw, (node?.acceptanceCriteria as string[] | undefined) ?? [], {
          gate: opts.verify === true,
          threshold:
            typeof opts.verifyThreshold === 'number' && !Number.isNaN(opts.verifyThreshold)
              ? opts.verifyThreshold
              : 0.6,
        })
        if (verification.blocked) {
          out.fail(
            'VERIFICATION_FAILED',
            `verificador reprovou o resultado (score ${verification.verdict.score.toFixed(2)}): ${verification.verdict.reasons.join('; ')} — corrija e re-submeta (ou escale o modelo)`,
            { verification: verification.verdict },
          )
          store.close()
          return
        }
        const deps: SubmitDeps = {
          getTask: (id) => {
            const n = store.getNodeById(id)
            return n ? { id: n.id, title: n.title } : null
          },
          runBlast: () =>
            opts.skipTest
              ? { passed: true }
              : runTestGate(opts.dir, (node?.testFiles as string[] | undefined) ?? [], opts.testCmd),
          runDoD: (id) => {
            const dod = checkDefinitionOfDone(store.toGraphDocument(), id)
            return { passed: dod.ready, score: dod.score, grade: dod.grade }
          },
          recordDeviations: (id, desvios) => recordDeviations(store, id, desvios),
          markDone: (id) => {
            const n = store.getNodeById(id)
            writeCompletionMemory(
              opts.dir,
              id,
              n?.title ?? id,
              `Task \`${id}\` concluída via modo delegado (agf submit).`,
            )
            store.updateNodeStatus(id, 'done')
            // node_ca455c0520fc — paridade com o next: flag > AGF_AGENT_ID.
            const releaseAgent = resolveReleaseAgentId(opts.agent, process.env.AGF_AGENT_ID)
            if (releaseAgent) {
              releaseTaskClaim(store.getDb(), id, releaseAgent)
            }
            recordTaskSavings(store, id, n?.title ?? id)
            // Shared finalize (parity with the --live provider path): episodic outcome
            // (Φ-spiral feedback) + learning signal + artifact cache. The delegate
            // protocol returns file names, not edit payloads, so no artifact is seeded
            // (finalizeTask no-ops the artifact when appliedEdits are absent).
            const signature = computeTaskSignature({
              title: n?.title ?? id,
              acceptanceCriteria: n?.acceptanceCriteria,
              type: n?.type,
              tags: n?.tags,
            })
            finalizeTask(
              store,
              { id, title: n?.title ?? id },
              {
                success: true,
                touchedFiles: result.arquivos,
                signature,
                approachSummary: `delegated: ${result.arquivos.join(', ')}`.slice(0, 240),
                acPassed: true,
                ...(opts.model !== undefined ? { model: opts.model } : {}),
              },
              { agentId: 'delegate' },
            )
            // Optional token capture (owner decision): unifies $/task across both
            // paths (--tokens or --tokens-in/out). Additive — absent flags → no row → byte-identical.
            if (hasConductorTokens) {
              recordConductorTokens(
                store,
                id,
                conductorTokens.tokensIn ?? 0,
                conductorTokens.tokensOut ?? 0,
                opts.model,
              )
            }
          },
        }

        const outcome = submitPipeline(taskId, result, deps)
        if (!outcome.accepted) {
          out.fail(outcome.code, outcome.reason, { taskId, detail: outcome.detail })
          return
        }

        // Record pilot token usage in llm_call_ledger (caller='pilot') when reported.
        let pilotUsage: { tokensIn: number; tokensOut: number; model: string } | undefined
        if (result.usage) {
          const sessionId = `pilot_submit_${taskId.slice(-8)}`
          recordPilotCall(store.getDb(), {
            nodeId: taskId,
            tokensIn: result.usage.tokens_in,
            tokensOut: result.usage.tokens_out,
            model: result.usage.model,
            sessionId,
          })
          pilotUsage = {
            tokensIn: result.usage.tokens_in,
            tokensOut: result.usage.tokens_out,
            model: result.usage.model,
          }
        }

        log.info('submit:accepted', { taskId, findings: outcome.findingIds.length })
        const savings = getCumulativeSavings(store)
        const next = findNextTask(store.toGraphDocument())
        out.ok({
          taskId,
          mode: 'delegated',
          dodScore: outcome.dodScore,
          dodGrade: outcome.dodGrade,
          applied: result.arquivos,
          deviations: outcome.deviations,
          findingIds: outcome.findingIds,
          pilotUsage,
          savings,
          // Verdict do cascade-verifier (advisory quando --verify não está ativo):
          // dá à formiga o mesmo sinal do provider sem bloquear o caminho default.
          verification: verification.verdict,
          next: next ? { id: next.node.id, title: next.node.title, reason: next.reason } : null,
        })
      } finally {
        maybeRunMemoryDynamicsTick(store)
        store.close()
      }
    },
  )
  return cmd
}
