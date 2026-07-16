/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { runScenario, loadSuite, type Orchestrate } from '../../core/evals/scenario-runner.js'
import { makeStubOrchestrate } from '../../core/evals/stub-orchestrate.js'
import { buildScorecard, collectVelocityScorecard } from '../../core/evals/scorecard.js'
import {
  compareEvalSessions,
  compareEvalRunsPerScenario,
  meetsQualityThreshold,
  checkCiGate,
} from '../../core/evals/eval-compare.js'
import { EvalRunStore, type EvalRunInput } from '../../core/store/eval-run-store.js'
import { GoldenStore, type GoldenEntry } from '../../core/store/golden-store.js'
import { runAstDogfood } from '../../core/evals/ast-dogfood.js'
import { checkEconomyRegressionGate, costPerSuccessMap } from '../../core/evals/economy-regression-gate.js'
import { rdGateCheck } from '../../core/economy/rd-sweep.js'
import { welchTTest } from '../../core/economy/ab-compare.js'
import { simulateProviders } from '../../core/observability/baseline.js'
import { recordModelCall } from '../../core/observability/llm-call-ledger.js'
import { openStoreOrFail } from '../open-store.js'
import { runBuildOrchestration } from '../shared/run-build.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOGFOOD_SUITE_DIR = join(__dirname, '../../tests/fixtures/eval')
const SUITE_ALIASES: Record<string, string> = {
  'tdd-compliance': join(process.cwd(), 'evals', 'suite', 'tdd-compliance'),
  economy: join(process.cwd(), 'evals', 'suite', 'economy'),
}

const log = createLogger({ layer: 'cli', source: 'eval-cmd.ts' })

/**
 * Picks the Orchestrate to drive scenarios with. `dry=true` swaps the real
 * build pipeline (workspace + PRD import + autopilot) for the deterministic
 * zero-network stub, so the scorecard mechanics can be smoke-tested without
 * spawning a real build.
 */
export function resolveOrchestrate(dry: boolean): Orchestrate {
  return dry ? makeStubOrchestrate() : runBuildOrchestration
}

/** Builds the `agf eval` CLI command (Commander definition). */
export function evalCommand(): Command {
  log.info('eval command registered')
  return new Command('eval')
    .description('Roda a suíte de cenários reais → scorecard (resolve% × custo-por-sucesso × tokens × latência)')
    .option('--suite <dir>', 'Diretório da suíte (scenario.json por subpasta)', 'evals/suite')
    .option('--tier <tier>', 'Filtra por tier (T0..T5)')
    .option('--model <id>', 'Modelo (ex.: deepseek/deepseek-v4-flash). Sem isto: tier-router (auto)')
    .option(
      '--models <ids>',
      'Benchmark multi-modelo (vírgula). Ex: deepseek/deepseek-v4-flash,meta-llama/llama-4-maverick,x-ai/grok-4.3',
    )
    .option('--provider <id>', 'Provider (ex.: openrouter, ollama)')
    .option('--base-url <url>', 'Endpoint OpenAI-compatible (ex.: http://IP:11434/v1)')
    .option('--live', 'Implementa de verdade (gasta token). Default: simulate (0 token)', false)
    .option('--simulate', 'Modo simulate — sem chamada LLM real; alias de --live false (para CI)', false)
    .option(
      '--dry',
      'Modo dry — usa stub Orchestrate determinístico (zero rede, zero build real); testa a mecânica do pipeline de scorecard',
      false,
    )
    .option('--repeat <n>', 'Repetições por cenário (variância)', '1')
    .option('--max <n>', 'Teto de passos por cenário', '12')
    .option('--out <file>', 'Salva o scorecard JSON')
    .option('-d, --dir <dir>', 'Diretório do projeto (para persistência de baseline)', process.cwd())
    .option('--compare <sessions>', 'Compara duas sessões do llm_call_ledger. Ex: baseline-dogfood-v2,haiku-first')
    .option(
      '--record-run <file>',
      'Persiste linhas eval_run (via EvalRunStore) a partir de um JSON array de {runId, goldenId, score, passed, latencyMs?, modelUsed?, costUsd?} — alimenta --compare/--quality-gate com dados reais',
    )
    .option(
      '--golden-add <file>',
      'Persiste linhas eval_golden (via GoldenStore) a partir de um JSON array de {input, expected, scorerKind, tool, projectId?, metadata?, tags?} — popula o golden dataset usado por --record-run/--compare',
    )
    .option('--quality-gate <runId>', 'Verifica se um run atinge quality_score ≥ 0.80 em ≥70% dos cenários')
    .option(
      '--gate',
      'CI gate: bloqueia (exit 1) se cost_regression>10% vs baseline ou quality_score<0.80. Grava label ci-gate.',
      false,
    )
    .option('--gate-run <runId>', 'Run ID para verificar no gate (padrão: ci-gate)')
    .option('--gate-baseline <session>', 'Session ID de baseline para comparação (padrão: baseline-dogfood-v2)')
    .action(
      async (opts: {
        suite: string
        tier?: string
        model?: string
        models?: string
        provider?: string
        baseUrl?: string
        live: boolean
        simulate: boolean
        dry: boolean
        repeat: string
        max: string
        out?: string
        dir?: string
        compare?: string
        recordRun?: string
        goldenAdd?: string
        qualityGate?: string
        gate: boolean
        gateRun?: string
        gateBaseline?: string
      }) => {
        const out = createCliOutput('eval')

        // ── --record-run mode: persist eval_run rows from a JSON file ─────────
        if (opts.recordRun) {
          if (!existsSync(opts.recordRun)) {
            out.fail('EVAL_RECORD_NO_FILE', `File not found at ${opts.recordRun}`, { path: opts.recordRun })
            return
          }
          let parsed: unknown
          try {
            parsed = JSON.parse(readFileSync(opts.recordRun, 'utf-8'))
          } catch (err) {
            out.fail('EVAL_RECORD_INVALID_JSON', `${opts.recordRun} is not valid JSON: ${String(err)}`, {
              path: opts.recordRun,
            })
            return
          }
          if (!Array.isArray(parsed)) {
            out.fail('EVAL_RECORD_INVALID_SHAPE', `${opts.recordRun} must contain a JSON array of eval_run entries`, {
              path: opts.recordRun,
            })
            return
          }
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            const evalRunStore = new EvalRunStore(store.getDb())
            const entries = (parsed as EvalRunInput[]).map((entry) => evalRunStore.record(entry))
            out.ok({ recorded: entries.length, entries })
          } finally {
            store.close()
          }
          return
        }

        // ── --golden-add mode: persist eval_golden rows from a JSON file ──────
        if (opts.goldenAdd) {
          if (!existsSync(opts.goldenAdd)) {
            out.fail('EVAL_GOLDEN_NO_FILE', `File not found at ${opts.goldenAdd}`, { path: opts.goldenAdd })
            return
          }
          let parsed: unknown
          try {
            parsed = JSON.parse(readFileSync(opts.goldenAdd, 'utf-8'))
          } catch (err) {
            out.fail('EVAL_GOLDEN_INVALID_JSON', `${opts.goldenAdd} is not valid JSON: ${String(err)}`, {
              path: opts.goldenAdd,
            })
            return
          }
          if (!Array.isArray(parsed)) {
            out.fail(
              'EVAL_GOLDEN_INVALID_SHAPE',
              `${opts.goldenAdd} must contain a JSON array of eval_golden entries`,
              {
                path: opts.goldenAdd,
              },
            )
            return
          }
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            const goldenStore = new GoldenStore(store.getDb())
            const entries = (parsed as Array<Omit<GoldenEntry, 'id' | 'createdAt'>>).map((entry) =>
              goldenStore.create(entry),
            )
            out.ok({ added: entries.length, entries })
          } finally {
            store.close()
          }
          return
        }

        // ── --compare mode: delta report between two ledger sessions ──────────
        if (opts.compare) {
          const parts = opts.compare.split(',').map((s) => s.trim())
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            out.err('INVALID_COMPARE', 'Use --compare <sessionA>,<sessionB>')
            return
          }
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            const db = store.getDb()
            const report = compareEvalSessions(db, parts[0], parts[1])
            const perScenario = compareEvalRunsPerScenario(db, parts[0], parts[1])
            const usd = (n: number | null): string => (n == null ? '—' : `$${n.toFixed(6)}`)
            const sign = (n: number): string => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
            const fmt2 = (n: number | null): string => (n == null ? '—' : n.toFixed(2))
            // Welch t-test on cost delta across scenarios
            const costsA = perScenario.filter((r) => r.costA !== null).map((r) => r.costA as number)
            const costsB = perScenario.filter((r) => r.costB !== null).map((r) => r.costB as number)
            const ttest = costsA.length >= 2 && costsB.length >= 2 ? welchTTest(costsA, costsB) : null
            out.ok({
              compare: { sessionA: parts[0], sessionB: parts[1] },
              a: {
                calls: report.a.calls,
                totalCostUsd: report.a.totalCostUsd,
                avgTokensIn: report.a.avgTokensIn,
                quality: report.a.quality,
              },
              b: {
                calls: report.b.calls,
                totalCostUsd: report.b.totalCostUsd,
                avgTokensIn: report.b.avgTokensIn,
                quality: report.b.quality,
              },
              delta: {
                tokensIn: report.deltaTokensIn,
                costUsd: report.deltaCostUsd,
                savingsPct: Math.round(report.savingsPct * 100) / 100,
              },
              perScenario,
              costSignificance: ttest
                ? { pValue: ttest.pValue, significant: ttest.significant, winner: ttest.winner }
                : null,
              summary: [
                `Compare: ${parts[0]} → ${parts[1]}`,
                `  A (${parts[0]}): ${report.a.calls} calls, ${usd(report.a.totalCostUsd)} total, ${report.a.avgTokensIn} avg_tok_in`,
                `  B (${parts[1]}): ${report.b.calls} calls, ${usd(report.b.totalCostUsd)} total, ${report.b.avgTokensIn} avg_tok_in`,
                `  Δ cost: ${sign(report.deltaCostUsd * 1e6)}µ$ · savings: ${report.savingsPct.toFixed(1)}%`,
                ...(report.a.quality && report.b.quality
                  ? [
                      `  Δ quality: A avg=${report.a.quality.avgScore.toFixed(2)} → B avg=${report.b.quality.avgScore.toFixed(2)}`,
                    ]
                  : []),
                ...(ttest
                  ? [
                      `  cost t-test: p=${ttest.pValue.toExponential(2)} (${ttest.significant ? `significant — winner ${ttest.winner}` : 'not significant'})`,
                    ]
                  : []),
                '',
                `  ${'scenario'.padEnd(24)} ${'scoreA'.padEnd(8)} ${'scoreB'.padEnd(8)} ${'costA'.padEnd(12)} ${'costB'.padEnd(12)} Δcost`,
                ...perScenario.map(
                  (r) =>
                    `  ${r.goldenId.padEnd(24)} ${fmt2(r.scoreA).padEnd(8)} ${fmt2(r.scoreB).padEnd(8)} ${usd(r.costA).padEnd(12)} ${usd(r.costB).padEnd(12)} ${r.deltaCost != null ? sign(r.deltaCost * 1e6) + 'µ$' : '—'}`,
                ),
              ],
            })
          } finally {
            store.close()
          }
          return
        }

        // ── --quality-gate mode: check quality threshold for a run ─────────────
        if (opts.qualityGate) {
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            const result = meetsQualityThreshold(store.getDb(), opts.qualityGate, { minScore: 0.8, minPassRate: 0.7 })
            out.ok({
              runId: opts.qualityGate,
              passes: result.passes,
              total: result.total,
              aboveThreshold: result.aboveThreshold,
              passRate: Math.round(result.passRate * 100),
              avgScore: Math.round(result.avgScore * 100) / 100,
              message: result.passes
                ? `Quality gate PASS: ${result.aboveThreshold}/${result.total} scenarios (${Math.round(result.passRate * 100)}%) scored ≥ 0.80`
                : `Quality gate FAIL: only ${result.aboveThreshold}/${result.total} scenarios (${Math.round(result.passRate * 100)}%) scored ≥ 0.80 (need ≥70%)`,
            })
          } finally {
            store.close()
          }
          return
        }

        // ── --suite economy --gate: committed-baseline cost regression gate ───
        // Unlike the session-based --gate below (compares two llm_call_ledger
        // sessions in the gitignored local DB), this baseline is a JSON file
        // meant to be committed, so it survives across ephemeral CI runs.
        if (opts.gate && opts.suite === 'economy') {
          const economyDir = SUITE_ALIASES.economy
          const scenarios = loadSuite(economyDir, opts.tier)
          if (scenarios.length === 0) {
            out.err('NO_SCENARIOS', `Nenhum cenário em ${economyDir}. Rode 'agf eval --suite economy' primeiro.`)
            return
          }
          const results = []
          for (const s of scenarios) {
            results.push(
              await runScenario(
                s,
                { live: opts.live && !opts.simulate, maxSteps: Math.max(1, parseInt(opts.max, 10) || 12) },
                { orchestrate: runBuildOrchestration, onLog: () => {} },
              ),
            )
          }
          const sc = buildScorecard(results)
          const costMap = costPerSuccessMap(sc.byModel)
          const gateResult = checkEconomyRegressionGate(resolve(opts.dir ?? process.cwd()), costMap, 0.1)
          out.ok({ gate: gateResult })
          if (!gateResult.passed) process.exitCode = 1
          return
        }

        // ── --gate mode: CI pre-PR quality + cost regression check ────────────
        if (opts.gate) {
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            const db = store.getDb()
            const runId = opts.gateRun ?? 'ci-gate'
            const baselineSession = opts.gateBaseline ?? 'baseline-dogfood-v2'
            const quality = meetsQualityThreshold(db, runId, { minScore: 0.8, minPassRate: 0.7 })
            const baselineRow = db
              .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM llm_call_ledger WHERE session_id = ?')
              .get(baselineSession) as { cost: number } | undefined
            const baselineCost = baselineRow && baselineRow.cost > 0 ? baselineRow.cost : null
            const currentRow = db
              .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM llm_call_ledger WHERE session_id = ?')
              .get(runId) as { cost: number } | undefined
            const currentCost = currentRow?.cost ?? 0
            const gateResult = checkCiGate(currentCost, quality, baselineCost, {
              maxCostRegressionPct: 10,
              minQualityScore: 0.8,
              minQualityPassRate: 0.7,
            })
            if (gateResult.passes) {
              recordModelCall(db, {
                sessionId: 'ci-gate',
                nodeId: 'ci-gate',
                provider: 'gate',
                model: 'gate',
                inputTokens: 0,
                outputTokens: 0,
                caller: 'eval-gate',
              })
            }
            // RD: regressao de distorcao >10% vs baseline reprova nomeando o
            // compressor (E4.T3). Primeira execucao semeia a baseline e passa.
            const rdGate = await rdGateCheck(store)
            const rdFailReasons = rdGate.regressions.map(
              (r) =>
                `rd_distortion_regression: ${r.compressor}/${r.mode} ` +
                `${r.baselineDistortion.toFixed(3)} -> ${r.currentDistortion.toFixed(3)}`,
            )
            out.ok({
              gate: {
                runId,
                baselineSession,
                passes: gateResult.passes && rdGate.passed,
                costRegressionPct:
                  gateResult.costRegressionPct != null ? Math.round(gateResult.costRegressionPct * 10) / 10 : null,
                qualityPassRate: Math.round(gateResult.qualityPassRate * 100),
                failReasons: [...gateResult.failReasons, ...rdFailReasons],
                rd: { seeded: rdGate.seeded, passed: rdGate.passed, regressions: rdGate.regressions },
                label: 'ci-gate',
              },
            })
            if (!gateResult.passes || !rdGate.passed) {
              process.exitCode = 1
            }
          } finally {
            store.close()
          }
          return
        }

        // ── ast-dogfood mode: deterministic AST compression benchmark on src/ ──
        if (opts.suite === 'ast-dogfood') {
          const srcCoreDir = join(resolve(opts.dir ?? process.cwd()), 'src', 'core')
          const sessionId = 'ast-dogfood'
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: false })
          try {
            const result = runAstDogfood(srcCoreDir, store.getDb(), { sessionId })
            out.ok({
              suite: 'ast-dogfood',
              dir: srcCoreDir,
              filesProcessed: result.filesProcessed,
              filesCompressed: result.filesCompressed,
              totalBytesBefore: result.totalBytesBefore,
              totalBytesAfter: result.totalBytesAfter,
              totalBytesSaved: result.totalBytesSaved,
              avgReductionPct: result.avgReductionPct,
              summary: [
                `AST Dogfood — ${srcCoreDir}`,
                `  Files processed : ${result.filesProcessed}`,
                `  Files compressed: ${result.filesCompressed} (${result.filesProcessed > 0 ? Math.round((result.filesCompressed / result.filesProcessed) * 100) : 0}%)`,
                `  Bytes before     : ${result.totalBytesBefore.toLocaleString()}`,
                `  Bytes after      : ${result.totalBytesAfter.toLocaleString()}`,
                `  Bytes saved      : ${result.totalBytesSaved.toLocaleString()} (avg ${result.avgReductionPct}% per compressed file)`,
                `  Lever            : ast_compress → saved recorded in economy_lever_ledger`,
              ],
            })
          } finally {
            store.close()
          }
          return
        }

        const isDogfood = opts.suite === 'dogfood'
        const suiteDir = isDogfood
          ? DOGFOOD_SUITE_DIR
          : SUITE_ALIASES[opts.suite] !== undefined
            ? SUITE_ALIASES[opts.suite]
            : resolve(opts.suite)
        const live = opts.live && !opts.simulate
        const scenarios = loadSuite(suiteDir, opts.tier)
        if (scenarios.length === 0) {
          out.err('NO_SCENARIOS', `Nenhum cenário em ${suiteDir}${opts.tier ? ` (tier ${opts.tier})` : ''}.`)
          return
        }

        const repeat = Math.max(1, parseInt(opts.repeat, 10) || 1)
        const maxSteps = Math.max(1, parseInt(opts.max, 10) || 12)
        const modelList = opts.models
          ? opts.models
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean)
          : opts.model
            ? [opts.model]
            : []
        const totalRuns = scenarios.length * repeat * Math.max(1, modelList.length)

        const orchestrate = resolveOrchestrate(opts.dry)
        const results = []
        const models = modelList.length > 0 ? modelList : [undefined]
        for (const model of models) {
          for (const s of scenarios) {
            for (let r = 0; r < repeat; r++) {
              const res = await runScenario(
                s,
                { live, maxSteps, model, provider: opts.provider, baseUrl: opts.baseUrl },
                { orchestrate, onLog: () => {} },
              )
              results.push(res)
            }
          }
        }

        const sc = buildScorecard(results)
        const simulate =
          results.reduce((a, r) => a + r.tokensIn, 0) > 0
            ? simulateProviders(
                results.reduce((a, r) => a + r.tokensIn, 0),
                0,
                results.reduce((a, r) => a + r.tokensOut, 0),
              )
            : null

        if (opts.out) {
          writeFileSync(resolve(opts.out), JSON.stringify(sc, null, 2), 'utf8')
        }

        // Persist baseline for dogfood suite + live mode (AC#2)
        if (isDogfood && live) {
          const store = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            for (const m of sc.byModel) {
              recordModelCall(store.getDb(), {
                sessionId: 'baseline-dogfood-v2',
                nodeId: 'eval-baseline',
                provider: opts.provider ?? 'eval-harness',
                model: m.model,
                inputTokens: m.avgTokensIn * m.total,
                outputTokens: m.avgTokensOut * m.total,
                caller: 'eval',
              })
            }
          } finally {
            store.close()
          }
        }

        // Velocity dims (node_d35e86e659dc): a MESMA computação de metrics/insights.
        // Sem grafo no dir (eval puro de cenários) segue sem a seção — nunca falha o eval.
        let velocity
        try {
          const velocityStore = openStoreOrFail(opts.dir ?? process.cwd(), { requireExisting: true })
          try {
            velocity = collectVelocityScorecard(velocityStore)
          } finally {
            velocityStore.close()
          }
        } catch {
          velocity = undefined
        }

        out.ok({
          scorecard: sc,
          ...(velocity ? { velocity } : {}),
          // rows is an alias for scorecard.byModel with costPerSuccess surfaced at top level
          rows: sc.byModel.map((m) => ({ ...m, costPerSuccess: m.costPerSuccess })),
          simulate: simulate ?? null,
          mode: live ? 'live' : 'simulate',
          totalRuns,
          note: live
            ? undefined
            : 'Modo simulate não implementa de fato (resolve=0 esperado). Use --live --model <id>.',
        })
      },
    )
}
